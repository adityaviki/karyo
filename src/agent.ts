import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import type { ToolContext, Message, ContentBlock, ToolCall } from "./types.js";

// Initialize Anthropic client
const anthropic = new Anthropic();

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

// Extract tool calls from assistant message
function extractToolCalls(content: Anthropic.ContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

// Check if content has any tool calls
function hasToolCalls(content: Anthropic.ContentBlock[]): boolean {
  return content.some((block) => block.type === "tool_use");
}

// Run the agent loop
export async function runAgent(
  userMessage: string,
  conversation: Message[],
  options: {
    workingDir: string;
    model?: string;
    maxTokens?: number;
  }
): Promise<void> {
  const {
    workingDir,
    model = "claude-sonnet-4-20250514",
    maxTokens = 8192,
  } = options;

  const systemPrompt = buildSystemPrompt(workingDir);
  const tools = getToolDefinitions();
  const ctx: ToolContext = { workingDir };

  // Add user message to conversation
  conversation.push({
    role: "user",
    content: userMessage,
  });

  // Agent loop - continue until no more tool calls
  while (true) {
    try {
      // Call Claude with streaming
      console.log(chalk.gray("\n─".repeat(40)));

      const stream = anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools,
        messages: conversation as Anthropic.MessageParam[],
      });

      // Collect response content
      const contentBlocks: Anthropic.ContentBlock[] = [];
      let currentText = "";

      // Process stream events
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") {
            currentText = "";
          } else if (event.content_block.type === "tool_use") {
            // Show tool call starting
            console.log(
              chalk.cyan(`\n[Tool: ${event.content_block.name}]`)
            );
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            // Stream text to console
            process.stdout.write(event.delta.text);
            currentText += event.delta.text;
          } else if (event.delta.type === "input_json_delta") {
            // Tool input is being streamed (we don't need to show this)
          }
        } else if (event.type === "content_block_stop") {
          // Block finished
        }
      }

      // Get final message
      const finalMessage = await stream.finalMessage();
      contentBlocks.push(...finalMessage.content);

      // Add assistant message to conversation
      conversation.push({
        role: "assistant",
        content: finalMessage.content as ContentBlock[],
      });

      // Check for tool calls
      if (hasToolCalls(finalMessage.content)) {
        const toolCalls = extractToolCalls(finalMessage.content);

        // Execute each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          console.log(
            chalk.yellow(`\nExecuting ${toolCall.name}...`)
          );

          const result = await executeTool(toolCall.name, toolCall.input, ctx);

          // Show brief result
          if (result.isError) {
            console.log(chalk.red(`Error: ${result.output.slice(0, 200)}`));
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: result.output,
            is_error: result.isError,
          });
        }

        // Add tool results to conversation
        conversation.push({
          role: "user",
          content: toolResults,
        });

        // Continue loop to process tool results
        continue;
      }

      // No more tool calls, we're done
      console.log(chalk.gray("\n" + "─".repeat(40)));
      break;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.error(chalk.red(`\nAPI Error: ${error.message}`));

        if (error.status === 429) {
          console.log(chalk.yellow("Rate limited. Waiting 10 seconds..."));
          await new Promise((resolve) => setTimeout(resolve, 10000));
          continue;
        }
      }

      throw error;
    }
  }
}

// Clear conversation history (keep system prompt behavior)
export function clearConversation(conversation: Message[]): void {
  conversation.length = 0;
}
