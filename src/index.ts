#!/usr/bin/env node

import "dotenv/config";
import * as readline from "readline";
import * as path from "path";
import chalk from "chalk";
import { runAgent, clearConversation } from "./agent.js";
import { login, logout, status, loadAuth } from "./auth.js";
import type { Message } from "./types.js";

// Parse command line arguments
async function parseArgs(): Promise<{ workingDir: string; model: string; action: "run" | "login" | "logout" | "status" }> {
  const args = process.argv.slice(2);
  let workingDir = process.cwd();
  let model = process.env.MODEL || "claude-opus-4-5-20251101";
  let action: "run" | "login" | "logout" | "status" = "run";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" || args[i] === "-d") {
      workingDir = path.resolve(args[++i] || ".");
    } else if (args[i] === "--model" || args[i] === "-m") {
      model = args[++i] || model;
    } else if (args[i] === "--login") {
      action = "login";
    } else if (args[i] === "--logout") {
      action = "logout";
    } else if (args[i] === "--status") {
      action = "status";
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
${chalk.bold("Karyo")} - A CLI coding assistant

${chalk.bold("Usage:")} npx tsx src/index.ts [options]

${chalk.bold("Options:")}
  -d, --dir <path>    Working directory (default: current directory)
  -m, --model <name>  Model to use (default: claude-opus-4-5-20251101)
  -h, --help          Show this help message

${chalk.bold("Authentication:")}
  --login             Login with Claude Pro/Max or API key
  --logout            Clear saved authentication
  --status            Show current auth status

${chalk.bold("Commands (during chat):")}
  /exit, /quit        Exit the agent
  /clear              Clear conversation history
  /help               Show available commands

${chalk.bold("Authentication:")}
  Anthropic API key (set via --login)
`);
      process.exit(0);
    }
  }

  return { workingDir, model, action };
}

// Print welcome message
async function printWelcome(workingDir: string, model: string): Promise<void> {
  const auth = await loadAuth();

  console.log(chalk.bold.blue("\n╭─────────────────────────────────────╮"));
  console.log(chalk.bold.blue("│             Karyo Agent             │"));
  console.log(chalk.bold.blue("╰─────────────────────────────────────╯"));
  console.log();
  console.log(chalk.gray(`Working directory: ${workingDir}`));
  console.log(chalk.gray(`Model: ${model}`));

  if (auth) {
    console.log(chalk.green("Auth: API Key"));
  } else {
    console.log(chalk.yellow("Auth: Not configured (run --login)"));
  }

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
`);
    return "handled";
  }

  return "continue";
}

// Main REPL loop
async function main(): Promise<void> {
  const { workingDir, model, action } = await parseArgs();

  // Handle auth actions
  if (action === "login") {
    await login();
    return;
  }

  if (action === "logout") {
    await logout();
    return;
  }

  if (action === "status") {
    await status();
    return;
  }

  // Check for any auth method
  const auth = await loadAuth();
  if (!auth) {
    console.log(chalk.yellow("No authentication configured."));
    console.log(chalk.gray("Run with --login to authenticate.\n"));

    const shouldLogin = await new Promise<boolean>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("Would you like to login now? (y/N) ", (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      });
    });

    if (shouldLogin) {
      const success = await login();
      if (!success) {
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  await printWelcome(workingDir, model);

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
