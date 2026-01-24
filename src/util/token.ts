import type { CoreMessage } from "ai";

// Approximate characters per token (conservative estimate)
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from a string
 */
export function estimateTokens(text: string): number {
  return Math.max(0, Math.round((text || "").length / CHARS_PER_TOKEN));
}

/**
 * Estimate tokens for a single message
 */
export function estimateMessageTokens(message: CoreMessage): number {
  // Base overhead for message structure
  let tokens = 4;

  if (typeof message.content === "string") {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text") {
        tokens += estimateTokens(part.text);
      } else if (part.type === "tool-call") {
        // Tool call: name + args
        tokens += estimateTokens(part.toolName);
        tokens += estimateTokens(JSON.stringify(part.args));
      } else if (part.type === "tool-result") {
        // Tool result content
        if (typeof part.result === "string") {
          tokens += estimateTokens(part.result);
        } else {
          tokens += estimateTokens(JSON.stringify(part.result));
        }
      }
    }
  }

  return tokens;
}

/**
 * Estimate total tokens for an array of messages
 */
export function estimateConversationTokens(messages: CoreMessage[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}
