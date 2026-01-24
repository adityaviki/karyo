import { z } from "zod";
import type { CoreMessage } from "ai";

// Tool context passed to every tool execution
export interface ToolContext {
  workingDir: string;
  abortSignal?: AbortSignal;
}

// Tool definition with Zod schema validation
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

// Result returned by tool execution
export interface ToolResult {
  output: string;
  isError?: boolean;
}

// Re-export AI SDK message type
export type Message = CoreMessage;

// Permission types
export type PermissionAction = "bash" | "write" | "edit";

export interface PermissionRequest {
  action: PermissionAction;
  details: string;
}

// Provider configuration
export interface ProviderConfig {
  id: string;
  name: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
}

// Available providers and their models
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5", description: "Most capable" },
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", description: "Balanced" },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", description: "Fast and capable" },
      { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5", description: "Fastest" },
    ],
  },
  {
    id: "google",
    name: "Google",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Fast multimodal" },
      { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro", description: "Advanced reasoning" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Long context" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "gpt-4o", name: "GPT-4o", description: "Most capable" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
      { id: "o1", name: "o1", description: "Advanced reasoning" },
      { id: "o1-mini", name: "o1 Mini", description: "Fast reasoning" },
    ],
  },
];

// Get all models flattened
export function getAllModels() {
  return PROVIDERS.flatMap((p) =>
    p.models.map((m) => ({
      ...m,
      provider: p.name,
      providerId: p.id,
    }))
  );
}

// Detect provider from model ID
export function getProviderId(modelId: string): string {
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("gpt") || modelId.startsWith("o1")) return "openai";
  throw new Error(`Unknown model: ${modelId}`);
}

// Model context and output limits
export interface ModelLimits {
  context: number;
  output: number;
}

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  // Anthropic - 200k context
  "claude-opus-4-5-20251101": { context: 200000, output: 32000 },
  "claude-sonnet-4-5-20250929": { context: 200000, output: 32000 },
  "claude-sonnet-4-20250514": { context: 200000, output: 32000 },
  "claude-haiku-3-5-20241022": { context: 200000, output: 32000 },
  // Google - large context windows
  "gemini-2.0-flash": { context: 1000000, output: 8192 },
  "gemini-2.0-pro": { context: 2000000, output: 8192 },
  "gemini-1.5-pro": { context: 2000000, output: 8192 },
  // OpenAI
  "gpt-4o": { context: 128000, output: 16384 },
  "gpt-4o-mini": { context: 128000, output: 16384 },
  "o1": { context: 200000, output: 100000 },
  "o1-mini": { context: 128000, output: 65536 },
};

// Get model limits with fallback defaults
export function getModelLimits(modelId: string): ModelLimits {
  if (MODEL_LIMITS[modelId]) {
    return MODEL_LIMITS[modelId];
  }
  // Fallback based on provider
  const providerId = getProviderId(modelId);
  switch (providerId) {
    case "anthropic":
      return { context: 200000, output: 32000 };
    case "google":
      return { context: 1000000, output: 8192 };
    case "openai":
      return { context: 128000, output: 16384 };
    default:
      return { context: 100000, output: 8192 };
  }
}
