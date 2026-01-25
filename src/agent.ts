import { streamText, type CoreMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import chalk from "chalk";
import { getTools } from "./tools/index.js";
import { loadAuth } from "./auth.js";
import { getProviderId, type ToolContext } from "./types.js";
import { ContextManager } from "./context.js";
import { formatTokens } from "./util/token.js";

// Provider registry - lazily initialized with API keys
const providers = {
  anthropic: (apiKey: string) => createAnthropic({ apiKey }),
  google: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
  openai: (apiKey: string) => createOpenAI({ apiKey }),
};

// System prompt template
function buildSystemPrompt(workingDir: string): string {
  return `You are a helpful coding assistant with access to tools for file operations and command execution.

Environment:
- Working directory: ${workingDir}
- Platform: ${process.platform}
- Date: ${new Date().toISOString().split("T")[0]}

Guidelines:
1. Always read files before editing them to understand their current content
2. Make small, targeted edits rather than rewriting entire files
3. Run tests after making changes when applicable
4. Ask clarifying questions if requirements are unclear
5. Explain your reasoning before making changes

Available tools:
- read: Read file contents with line numbers
- glob: Find files matching a pattern
- grep: Search for patterns in files
- bash: Execute shell commands
- write: Create or overwrite files
- edit: Find and replace text in files

When editing files, make sure to match the exact text including whitespace and indentation.`;
}

// Get the language model for a given model ID
export async function getModel(modelId: string): Promise<LanguageModel> {
  const auth = await loadAuth();
  const providerId = getProviderId(modelId);

  switch (providerId) {
    case "anthropic": {
      if (!auth?.anthropic) {
        throw new Error("Anthropic API key not configured. Run with --login to add it.");
      }
      const provider = providers.anthropic(auth.anthropic);
      return provider(modelId);
    }
    case "google": {
      if (!auth?.google) {
        throw new Error("Google API key not configured. Run with --login to add it.");
      }
      const provider = providers.google(auth.google);
      return provider(modelId);
    }
    case "openai": {
      if (!auth?.openai) {
        throw new Error("OpenAI API key not configured. Run with --login to add it.");
      }
      const provider = providers.openai(auth.openai);
      return provider(modelId);
    }
    default:
      throw new Error(`Unknown provider for model: ${modelId}`);
  }
}

// Main agent entry point - unified for all providers
export async function runAgent(
  userMessage: string,
  messages: CoreMessage[],
  options: {
    workingDir: string;
    model?: string;
    maxTokens?: number;
  }
): Promise<void> {
  const {
    workingDir,
    model: modelId = process.env.MODEL || "claude-sonnet-4-20250514",
    maxTokens = 8192,
  } = options;

  // Get the model
  const model = await getModel(modelId);

  // Create context manager
  const contextManager = new ContextManager(modelId);

  // Create tool context
  const ctx: ToolContext = { workingDir };
  const tools = getTools(ctx);

  // Add user message to conversation
  messages.push({ role: "user", content: userMessage });

  // Process messages for context management (pruning/compaction)
  const { messages: processedMessages, action } = await contextManager.processMessages(
    messages,
    model
  );

  // If messages were compacted, update the original array
  if (action === "compacted") {
    messages.length = 0;
    messages.push(...processedMessages);
  } else if (action === "pruned") {
    // Update messages in place with pruned versions
    messages.length = 0;
    messages.push(...processedMessages);
  }

  console.log(chalk.gray("\n" + "─".repeat(40)));

  // Debug: log message count
  if (process.env.DEBUG) {
    console.log(chalk.gray(`[Debug] Sending ${processedMessages.length} messages to ${modelId}`));
  }

  // Use AI SDK's streamText - works identically for ALL providers
  const result = streamText({
    model,
    system: buildSystemPrompt(workingDir),
    messages: processedMessages,
    tools,
    maxTokens,
    maxSteps: 20, // Allow up to 20 tool call rounds

    // Called on errors
    onError: (error) => {
      console.error(chalk.red(`\nStream error: ${error}`));
    },

    // Called when each step finishes (after tool execution)
    onStepFinish: async (step) => {
      // Log tool calls
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const tc of step.toolCalls) {
          console.log(chalk.cyan(`\n[Tool: ${tc.toolName}]`));
        }
      }

      // Log tool results
      if (step.toolResults && step.toolResults.length > 0) {
        for (const tr of step.toolResults) {
          // tr.result contains the tool output
          const output = String((tr as { result: unknown }).result || "");
          // Show output (truncate if too long)
          if (output.length > 0) {
            if (output.length > 500) {
              console.log(chalk.gray(`Result: ${output.slice(0, 500)}...`));
            } else {
              console.log(chalk.gray(`Result: ${output}`));
            }
          }
        }
      }
    },
  });

  // Stream the text output
  let hasOutput = false;
  try {
    for await (const textPart of result.textStream) {
      hasOutput = true;
      process.stdout.write(textPart);
    }
  } catch (streamError) {
    console.error(chalk.red(`\nStream iteration error: ${streamError}`));
    throw streamError;
  }

  if (!hasOutput) {
    console.log(chalk.yellow("\n(No text response from model)"));
  }

  // Wait for completion and get final response
  const response = await result.response;

  // Debug: log response info
  if (process.env.DEBUG) {
    console.log(chalk.gray(`[Debug] Response has ${response.messages?.length || 0} messages`));
  }

  // Add the assistant's final messages to conversation history
  // The AI SDK returns all messages including tool calls and results
  const assistantMessages = response.messages.filter(
    (m) => m.role === "assistant" || m.role === "tool"
  );

  // Add assistant messages to our conversation
  for (const msg of assistantMessages) {
    messages.push(msg);
  }

  console.log(chalk.gray("\n" + "─".repeat(40)));

  // Log usage and context statistics
  const usage = await result.usage;
  const stats = contextManager.getStats(messages);

  if (usage) {
    console.log(
      chalk.gray(
        `Tokens: ${usage.promptTokens} in, ${usage.completionTokens} out | ` +
        `Context: ${formatTokens(stats.estimatedTokens)}/${formatTokens(stats.usableContext)} (${stats.usagePercent}%)`
      )
    );
  } else {
    console.log(
      chalk.gray(
        `Context: ${formatTokens(stats.estimatedTokens)}/${formatTokens(stats.usableContext)} (${stats.usagePercent}%)`
      )
    );
  }

  // Warn if approaching limits
  if (stats.usagePercent > 70) {
    console.log(chalk.yellow(`⚠ Context at ${stats.usagePercent}% - will auto-manage soon`));
  }
}

// Clear conversation history
export function clearConversation(messages: CoreMessage[]): void {
  messages.length = 0;
}

// Get context stats for display
export function getContextStats(
  messages: CoreMessage[],
  modelId: string
): ReturnType<ContextManager["getStats"]> {
  const contextManager = new ContextManager(modelId);
  return contextManager.getStats(messages);
}

// Format context stats for display
export function formatContextStats(
  messages: CoreMessage[],
  modelId: string
): string {
  const contextManager = new ContextManager(modelId);
  const stats = contextManager.getStats(messages);
  return contextManager.formatStats(stats);
}
