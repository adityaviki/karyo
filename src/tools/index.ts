import { tool, type CoreTool } from "ai";
import type { ToolDefinition, ToolContext } from "../types.js";
import { readTool } from "./read.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { bashTool } from "./bash.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";

// All available tool definitions
const toolDefinitions: ToolDefinition[] = [
  readTool,
  globTool,
  grepTool,
  bashTool,
  writeTool,
  editTool,
];

// Convert our tool definitions to AI SDK format
export function getTools(ctx: ToolContext): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};

  for (const def of toolDefinitions) {
    tools[def.name] = tool({
      description: def.description,
      parameters: def.parameters,
      execute: async (args) => {
        const result = await def.execute(args as Record<string, unknown>, ctx);
        // AI SDK expects the result to be returned directly
        return result.output;
      },
    });
  }

  return tools;
}

// Find a tool by name (for debugging/inspection)
export function getTool(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((t) => t.name === name);
}

// Get tool names
export function getToolNames(): string[] {
  return toolDefinitions.map((t) => t.name);
}

// Export all tools for direct access
export { readTool } from "./read.js";
export { globTool } from "./glob.js";
export { grepTool } from "./grep.js";
export { bashTool } from "./bash.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
