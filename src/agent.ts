import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import { loadAuth } from "./auth.js";
import type { ToolContext, Message } from "./types.js";

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

// Run agent with Anthropic API key
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
    model = process.env.MODEL || "claude-opus-4-5-20251101",
    maxTokens = 8192,
  } = options;

  const auth = await loadAuth();
  if (!auth) {
    throw new Error("No authentication configured. Run with --login to authenticate.");
  }

  const systemPrompt = buildSystemPrompt(workingDir);
  const tools = getToolDefinitions();
  const ctx: ToolContext = { workingDir };

  // Add user message
  conversation.push({ role: "user", content: userMessage });

  const anthropic = new Anthropic({
    apiKey: auth.key,
  });

  while (true) {
    console.log(chalk.gray("\n" + "─".repeat(40)));

    // Build messages for Anthropic
    const messages: Anthropic.MessageParam[] = conversation.map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role as "user" | "assistant", content: m.content };
      }
      // Handle tool results
      if (Array.isArray(m.content) && m.content[0]?.type === "tool_result") {
        return {
          role: "user" as const,
          content: m.content.map((tr: any) => ({
            type: "tool_result" as const,
            tool_use_id: tr.tool_use_id,
            content: tr.content,
          })),
        };
      }
      return m as Anthropic.MessageParam;
    });

    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools,
      messages,
    });

    let currentText = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          console.log(chalk.cyan(`\n[Tool: ${event.content_block.name}]`));
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          process.stdout.write(event.delta.text);
          currentText += event.delta.text;
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    conversation.push({ role: "assistant", content: finalMessage.content as any });

    // Check for tool calls
    const toolUseBlocks = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length > 0) {
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        console.log(chalk.yellow(`\nExecuting ${block.name}...`));
        const result = await executeTool(block.name, block.input as Record<string, unknown>, ctx);

        if (result.isError) {
          console.log(chalk.red(`Error: ${result.output.slice(0, 200)}`));
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.output,
        });
      }

      conversation.push({ role: "user", content: toolResults });
      continue;
    }

    console.log(chalk.gray("\n" + "─".repeat(40)));
    break;
  }
}

// Clear conversation history
export function clearConversation(conversation: Message[]): void {
  conversation.length = 0;
}
