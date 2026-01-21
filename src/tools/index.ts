import type Anthropic from "@anthropic-ai/sdk";
import { type ToolDefinition, type ToolContext, type ToolResult, toAnthropicTool } from "../types.js";
import { readTool } from "./read.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { bashTool } from "./bash.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";

// All available tools
const tools: ToolDefinition[] = [
  readTool,
  globTool,
  grepTool,
  bashTool,
  writeTool,
  editTool,
];

// Get tool definitions in Anthropic format
export function getToolDefinitions(): Anthropic.Tool[] {
  return tools.map(toAnthropicTool);
}

// Find a tool by name
export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

// Execute a tool by name with given arguments
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const tool = getTool(name);

  if (!tool) {
    return {
      output: `Error: Unknown tool "${name}"`,
      isError: true,
    };
  }

  try {
    // Validate args with Zod schema
    const validatedArgs = tool.parameters.parse(args);
    return await tool.execute(validatedArgs, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Error executing ${name}: ${message}`,
      isError: true,
    };
  }
}

// Export all tools for direct access
export { readTool } from "./read.js";
export { globTool } from "./glob.js";
export { grepTool } from "./grep.js";
export { bashTool } from "./bash.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
