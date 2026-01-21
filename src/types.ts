import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

// Tool context passed to every tool execution
export interface ToolContext {
  workingDir: string;
  abortSignal?: AbortSignal;
}

// Tool definition with Zod schema validation
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

// Result returned by tool execution
export interface ToolResult {
  output: string;
  isError?: boolean;
}

// Anthropic message types
export type MessageRole = "user" | "assistant";

export type ContentBlock =
  | Anthropic.TextBlock
  | Anthropic.ToolUseBlock
  | Anthropic.ToolResultBlockParam;

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

// Conversation state
export interface Conversation {
  messages: Message[];
  systemPrompt: string;
}

// Tool call from assistant
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Permission types
export type PermissionAction = "bash" | "write" | "edit";

export interface PermissionRequest {
  action: PermissionAction;
  details: string;
}

// Convert our tool definition to Anthropic's format
export function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.parameters),
  };
}

// Convert Zod schema to JSON Schema for Anthropic
function zodToJsonSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const jsonSchema = zodToJson(schema);
  return jsonSchema as Anthropic.Tool.InputSchema;
}

// Simple Zod to JSON Schema converter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToJson(schema: z.ZodType): Record<string, unknown> {
  // Access internal Zod properties
  const def = (schema as any)._def;
  const typeName = def?.typeName as string | undefined;

  if (typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType;
      const fieldDef = (fieldSchema as any)._def;
      properties[key] = zodToJson(fieldSchema);

      // Check if field is optional
      if (fieldDef?.typeName !== "ZodOptional") {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (typeName === "ZodString") {
    const result: Record<string, unknown> = { type: "string" };
    if (def.description) result.description = def.description;
    return result;
  }

  if (typeName === "ZodNumber") {
    const result: Record<string, unknown> = { type: "number" };
    if (def.description) result.description = def.description;
    return result;
  }

  if (typeName === "ZodBoolean") {
    const result: Record<string, unknown> = { type: "boolean" };
    if (def.description) result.description = def.description;
    return result;
  }

  if (typeName === "ZodArray") {
    const innerSchema = def.type as z.ZodType;
    return {
      type: "array",
      items: zodToJson(innerSchema),
    };
  }

  if (typeName === "ZodOptional") {
    const innerSchema = def.innerType as z.ZodType;
    return zodToJson(innerSchema);
  }

  if (typeName === "ZodDefault") {
    const innerSchema = def.innerType as z.ZodType;
    return zodToJson(innerSchema);
  }

  if (typeName === "ZodEnum") {
    const values = def.values as string[];
    return {
      type: "string",
      enum: values,
    };
  }

  // Fallback
  return { type: "string" };
}
