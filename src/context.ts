import { generateText, type CoreMessage, type LanguageModel } from "ai";
import chalk from "chalk";
import {
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  formatTokens,
} from "./util/token.js";
import { getModelLimits, type ModelLimits } from "./types.js";

// Context management thresholds (same as OpenCode)
export const PRUNE_PROTECT = 40000; // Protect recent 40k tokens of tool outputs
export const PRUNE_MINIMUM = 20000; // Only prune if ≥20k can be freed
export const CONTEXT_THRESHOLD = 0.7; // Start pruning at 70% usage
export const COMPACT_THRESHOLD = 0.85; // Summarize at 85% usage

// Placeholder for pruned content
const PRUNED_PLACEHOLDER = "[Tool output cleared - context management]";

export interface ContextStats {
  messageCount: number;
  estimatedTokens: number;
  contextLimit: number;
  outputReserve: number;
  usableContext: number;
  usagePercent: number;
  toolOutputs: number;
  prunedOutputs: number;
}

/**
 * Context manager for handling conversation context limits
 */
export class ContextManager {
  private modelId: string;
  private limits: ModelLimits;

  constructor(modelId: string) {
    this.modelId = modelId;
    this.limits = getModelLimits(modelId);
  }

  /**
   * Get usable context (total - output reserve)
   */
  getUsableContext(): number {
    return this.limits.context - this.limits.output;
  }

  /**
   * Estimate tokens for the conversation
   */
  estimateTokens(messages: CoreMessage[]): number {
    return estimateConversationTokens(messages);
  }

  /**
   * Check if context is approaching the prune threshold
   */
  shouldPrune(messages: CoreMessage[]): boolean {
    const tokens = this.estimateTokens(messages);
    const usable = this.getUsableContext();
    return tokens > usable * CONTEXT_THRESHOLD;
  }

  /**
   * Check if context needs compaction (summarization)
   */
  shouldCompact(messages: CoreMessage[]): boolean {
    const tokens = this.estimateTokens(messages);
    const usable = this.getUsableContext();
    return tokens > usable * COMPACT_THRESHOLD;
  }

  /**
   * Prune old tool outputs from messages
   * Returns a new array with pruned content
   */
  pruneToolOutputs(messages: CoreMessage[]): {
    messages: CoreMessage[];
    prunedCount: number;
    tokensSaved: number;
  } {
    const result: CoreMessage[] = [];
    let userTurns = 0;
    let accumulatedTokens = 0;
    let prunedCount = 0;
    let tokensSaved = 0;
    const toPrune: Array<{ msgIndex: number; partIndex: number; tokens: number }> = [];

    // First pass: identify what to prune (backwards traversal)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // Count user turns
      if (msg.role === "user") {
        userTurns++;
      }

      // Skip recent 2 turns
      if (userTurns < 2) continue;

      // Check for tool results in message content
      if (Array.isArray(msg.content)) {
        for (let j = msg.content.length - 1; j >= 0; j--) {
          const part = msg.content[j];
          if (part.type === "tool-result") {
            const resultStr =
              typeof part.result === "string"
                ? part.result
                : JSON.stringify(part.result);

            // Skip already pruned
            if (resultStr === PRUNED_PLACEHOLDER) continue;

            const partTokens = estimateTokens(resultStr);
            accumulatedTokens += partTokens;

            // After accumulating PRUNE_PROTECT, mark for pruning
            if (accumulatedTokens > PRUNE_PROTECT) {
              toPrune.push({ msgIndex: i, partIndex: j, tokens: partTokens });
            }
          }
        }
      }
    }

    // Calculate total tokens that would be saved
    const potentialSavings = toPrune.reduce((sum, p) => sum + p.tokens, 0);

    // Only prune if we'd save enough tokens
    if (potentialSavings < PRUNE_MINIMUM) {
      return { messages, prunedCount: 0, tokensSaved: 0 };
    }

    // Create pruned copy of messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const pruneIndices = toPrune
        .filter((p) => p.msgIndex === i)
        .map((p) => p.partIndex);

      if (pruneIndices.length === 0 || !Array.isArray(msg.content)) {
        result.push(msg);
        continue;
      }

      // Clone message with pruned content
      const newContent = msg.content.map((part, j) => {
        if (pruneIndices.includes(j) && part.type === "tool-result") {
          prunedCount++;
          const resultStr =
            typeof part.result === "string"
              ? part.result
              : JSON.stringify(part.result);
          tokensSaved += estimateTokens(resultStr);
          return { ...part, result: PRUNED_PLACEHOLDER };
        }
        return part;
      });

      result.push({ ...msg, content: newContent } as CoreMessage);
    }

    return { messages: result, prunedCount, tokensSaved };
  }

  /**
   * Generate a summary of the conversation
   */
  async summarize(
    messages: CoreMessage[],
    model: LanguageModel
  ): Promise<CoreMessage[]> {
    console.log(chalk.yellow("\nCompacting conversation..."));

    try {
      const summary = await generateText({
        model,
        system: `You are summarizing a coding assistant conversation. Provide a concise summary that captures:
1. What tasks were accomplished
2. What files were modified or created
3. Current state of the work
4. Any pending tasks or next steps

Be specific about file names and changes made. Keep the summary under 1000 words.`,
        messages,
        maxTokens: 2000,
      });

      // Return new conversation starting with summary
      return [
        {
          role: "user" as const,
          content: "What have we accomplished so far in this session?",
        },
        {
          role: "assistant" as const,
          content: summary.text,
        },
        {
          role: "user" as const,
          content: "Thanks for the summary. Let's continue.",
        },
      ];
    } catch (error) {
      console.error(chalk.red("Failed to generate summary, keeping original messages"));
      return messages;
    }
  }

  /**
   * Get context usage statistics
   */
  getStats(messages: CoreMessage[]): ContextStats {
    const estimatedTokens = this.estimateTokens(messages);
    const usableContext = this.getUsableContext();

    let toolOutputs = 0;
    let prunedOutputs = 0;

    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "tool-result") {
            toolOutputs++;
            const resultStr =
              typeof part.result === "string"
                ? part.result
                : JSON.stringify(part.result);
            if (resultStr === PRUNED_PLACEHOLDER) {
              prunedOutputs++;
            }
          }
        }
      }
    }

    return {
      messageCount: messages.length,
      estimatedTokens,
      contextLimit: this.limits.context,
      outputReserve: this.limits.output,
      usableContext,
      usagePercent: Math.round((estimatedTokens / usableContext) * 100),
      toolOutputs,
      prunedOutputs,
    };
  }

  /**
   * Format stats for display
   */
  formatStats(stats: ContextStats): string {
    const lines = [
      chalk.bold("\nContext Usage:"),
      `  Messages: ${stats.messageCount}`,
      `  Tokens: ${formatTokens(stats.estimatedTokens)} / ${formatTokens(stats.usableContext)} (${stats.usagePercent}%)`,
      `  Tool outputs: ${stats.toolOutputs}${stats.prunedOutputs > 0 ? ` (${stats.prunedOutputs} pruned)` : ""}`,
    ];

    // Add warning if approaching limits
    if (stats.usagePercent > 70) {
      lines.push(chalk.yellow(`  ⚠ Approaching context limit`));
    }

    return lines.join("\n");
  }

  /**
   * Process messages before sending to API
   * Handles pruning and compaction as needed
   */
  async processMessages(
    messages: CoreMessage[],
    model: LanguageModel
  ): Promise<{ messages: CoreMessage[]; action: "none" | "pruned" | "compacted" }> {
    // Check if we need to prune
    if (this.shouldPrune(messages)) {
      const { messages: pruned, prunedCount, tokensSaved } = this.pruneToolOutputs(messages);

      if (prunedCount > 0) {
        console.log(
          chalk.yellow(
            `\n⚡ Pruned ${prunedCount} old tool outputs (saved ~${formatTokens(tokensSaved)} tokens)`
          )
        );

        // Check if we still need compaction after pruning
        if (this.shouldCompact(pruned)) {
          const compacted = await this.summarize(pruned, model);
          console.log(chalk.yellow("📝 Conversation compacted to summary"));
          return { messages: compacted, action: "compacted" };
        }

        return { messages: pruned, action: "pruned" };
      }
    }

    // Check if we need compaction even without prunable content
    if (this.shouldCompact(messages)) {
      const compacted = await this.summarize(messages, model);
      console.log(chalk.yellow("📝 Conversation compacted to summary"));
      return { messages: compacted, action: "compacted" };
    }

    return { messages, action: "none" };
  }
}
