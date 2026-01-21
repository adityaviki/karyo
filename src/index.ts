#!/usr/bin/env node

import "dotenv/config";
import * as readline from "readline";
import * as path from "path";
import chalk from "chalk";
import { runAgent, clearConversation } from "./agent.js";
import type { Message } from "./types.js";

// Parse command line arguments
function parseArgs(): { workingDir: string; model: string } {
  const args = process.argv.slice(2);
  let workingDir = process.cwd();
  let model = process.env.MODEL || "claude-sonnet-4-20250514";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" || args[i] === "-d") {
      workingDir = path.resolve(args[++i] || ".");
    } else if (args[i] === "--model" || args[i] === "-m") {
      model = args[++i] || model;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Simple Agent - A CLI coding assistant

Usage: npx tsx src/index.ts [options]

Options:
  -d, --dir <path>    Working directory (default: current directory)
  -m, --model <name>  Model to use (default: claude-sonnet-4-20250514)
  -h, --help          Show this help message

Commands (during chat):
  /exit, /quit        Exit the agent
  /clear              Clear conversation history
  /help               Show available commands

Environment:
  ANTHROPIC_API_KEY   Your Anthropic API key (required)
`);
      process.exit(0);
    }
  }

  return { workingDir, model };
}

// Print welcome message
function printWelcome(workingDir: string, model: string): void {
  console.log(chalk.bold.blue("\n╭─────────────────────────────────────╮"));
  console.log(chalk.bold.blue("│         Simple Coding Agent         │"));
  console.log(chalk.bold.blue("╰─────────────────────────────────────╯"));
  console.log();
  console.log(chalk.gray(`Working directory: ${workingDir}`));
  console.log(chalk.gray(`Model: ${model}`));
  console.log();
  console.log(chalk.gray("Type your message and press Enter."));
  console.log(chalk.gray("Commands: /exit, /clear, /help"));
  console.log();
}

// Handle special commands
function handleCommand(
  input: string,
  conversation: Message[]
): "continue" | "exit" | "handled" {
  const command = input.trim().toLowerCase();

  if (command === "/exit" || command === "/quit" || command === "/q") {
    console.log(chalk.yellow("\nGoodbye!"));
    return "exit";
  }

  if (command === "/clear") {
    clearConversation(conversation);
    console.log(chalk.green("\nConversation cleared."));
    return "handled";
  }

  if (command === "/help") {
    console.log(`
${chalk.bold("Available commands:")}
  /exit, /quit, /q    Exit the agent
  /clear              Clear conversation history
  /help               Show this help message

${chalk.bold("Tips:")}
  - The agent can read, write, and edit files
  - It can execute bash commands (with permission for dangerous ones)
  - Use glob and grep to search for files and content
  - Multi-line input: end with a blank line
`);
    return "handled";
  }

  return "continue";
}

// Main REPL loop
async function main(): Promise<void> {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red("Error: ANTHROPIC_API_KEY environment variable is not set."));
    console.error(chalk.gray("Set it with: export ANTHROPIC_API_KEY=your-key-here"));
    process.exit(1);
  }

  const { workingDir, model } = parseArgs();
  printWelcome(workingDir, model);

  const conversation: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question(chalk.green("\n> "), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Check for commands
      if (trimmed.startsWith("/")) {
        const result = handleCommand(trimmed, conversation);
        if (result === "exit") {
          rl.close();
          return;
        }
        prompt();
        return;
      }

      // Run agent with user input
      try {
        await runAgent(trimmed, conversation, { workingDir, model });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\nError: ${message}`));
      }

      prompt();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on("close", () => {
    console.log(chalk.yellow("\nGoodbye!"));
    process.exit(0);
  });

  // Start the REPL
  prompt();
}

// Run
main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
