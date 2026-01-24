#!/usr/bin/env node

import "dotenv/config";
import * as readline from "readline";
import * as path from "path";
import chalk from "chalk";
import type { CoreMessage } from "ai";
import { runAgent, clearConversation, formatContextStats } from "./agent.js";
import { login, logout, status, loadAuth } from "./auth.js";
import { getAllModels, PROVIDERS } from "./types.js";

// Interactive model selector
async function selectModel(): Promise<string> {
  const allModels = getAllModels();

  console.log(chalk.bold("\nSelect a model:\n"));

  allModels.forEach((model, index) => {
    const num = chalk.cyan(`  ${(index + 1).toString().padStart(2)})`);
    const name = chalk.white(model.name);
    const provider = chalk.gray(`[${model.provider}]`);
    const desc = chalk.dim(model.description);
    console.log(`${num} ${name} ${provider} - ${desc}`);
  });

  console.log();

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askSelection = (): void => {
      rl.question(
        chalk.green("Enter number (1-" + allModels.length + "): "),
        (answer) => {
          const num = parseInt(answer.trim(), 10);
          if (num >= 1 && num <= allModels.length) {
            rl.close();
            const selected = allModels[num - 1];
            console.log(chalk.green(`\n✓ Selected: ${selected.name}\n`));
            resolve(selected.id);
          } else {
            console.log(chalk.red("Invalid selection. Please try again."));
            askSelection();
          }
        }
      );
    };

    askSelection();
  });
}

// Parse command line arguments
async function parseArgs(): Promise<{
  workingDir: string;
  model: string;
  action: "run" | "login" | "logout" | "status" | "select-model";
}> {
  const args = process.argv.slice(2);
  let workingDir = process.cwd();
  let model = process.env.MODEL || "claude-sonnet-4-20250514";
  let action: "run" | "login" | "logout" | "status" | "select-model" = "run";

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
    } else if (args[i] === "--select" || args[i] === "-s") {
      action = "select-model";
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
${chalk.bold("Karyo")} - A CLI coding assistant powered by Vercel AI SDK

${chalk.bold("Usage:")} npx tsx src/index.ts [options]

${chalk.bold("Options:")}
  -d, --dir <path>    Working directory (default: current directory)
  -m, --model <name>  Model to use (default: claude-sonnet-4-20250514)
  -s, --select        Interactively select a model
  -h, --help          Show this help message

${chalk.bold("Authentication:")}
  --login             Add API key for a provider
  --logout            Clear saved authentication
  --status            Show current auth status

${chalk.bold("Commands (during chat):")}
  /exit, /quit        Exit the agent
  /clear              Clear conversation history
  /context            Show context usage statistics
  /model              Change model
  /help               Show available commands

${chalk.bold("Supported Providers:")}
  - Anthropic: claude-* models (Claude Opus, Sonnet, Haiku)
  - Google: gemini-* models (Gemini 2.0, 1.5)
  - OpenAI: gpt-* and o1-* models (GPT-4o, o1)
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
  console.log(chalk.bold.blue("│      Powered by Vercel AI SDK       │"));
  console.log(chalk.bold.blue("╰─────────────────────────────────────╯"));
  console.log();
  console.log(chalk.gray(`Working directory: ${workingDir}`));
  console.log(chalk.gray(`Model: ${model}`));

  if (auth?.anthropic || auth?.google || auth?.openai) {
    const providers = [];
    if (auth.anthropic) providers.push("Anthropic");
    if (auth.google) providers.push("Google");
    if (auth.openai) providers.push("OpenAI");
    console.log(chalk.green(`Auth: ${providers.join(", ")}`));
  } else {
    console.log(chalk.yellow("Auth: Not configured (run --login)"));
  }

  console.log();
  console.log(chalk.gray("Type your message and press Enter."));
  console.log(chalk.gray("Commands: /exit, /clear, /context, /model, /help"));
  console.log();
}

// Handle special commands
function handleCommand(
  input: string,
  conversation: CoreMessage[],
  model: string
): "continue" | "exit" | "handled" | "model" {
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

  if (command === "/model") {
    return "model";
  }

  if (command === "/context") {
    console.log(formatContextStats(conversation, model));
    return "handled";
  }

  if (command === "/help") {
    console.log(`
${chalk.bold("Available commands:")}
  /exit, /quit, /q    Exit the agent
  /clear              Clear conversation history
  /context            Show context usage statistics
  /model              Change the model
  /help               Show this help message

${chalk.bold("Context Management:")}
  - Context is automatically managed to stay within model limits
  - Old tool outputs are pruned when approaching 70% capacity
  - Conversation is summarized when approaching 85% capacity
  - Use /context to check current usage

${chalk.bold("Tips:")}
  - The agent can read, write, and edit files
  - It can execute bash commands (with permission for dangerous ones)
  - Use glob and grep to search for files and content
  - Supports Claude, Gemini, and GPT models via unified AI SDK
`);
    return "handled";
  }

  return "continue";
}

// Main REPL loop
async function main(): Promise<void> {
  const { workingDir, model: initialModel, action } = await parseArgs();
  let model = initialModel;

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

  // Handle model selection
  if (action === "select-model") {
    model = await selectModel();
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

  const conversation: CoreMessage[] = [];

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
        const result = handleCommand(trimmed, conversation, model);
        if (result === "exit") {
          rl.close();
          return;
        }
        if (result === "model") {
          rl.close();
          model = await selectModel();
          console.log(chalk.gray(`Model changed to: ${model}`));
          // Restart readline
          const newRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          newRl.on("close", () => {
            console.log(chalk.yellow("\nGoodbye!"));
            process.exit(0);
          });
          const promptWithRl = (): void => {
            newRl.question(chalk.green("\n> "), async (newInput) => {
              const newTrimmed = newInput.trim();
              if (!newTrimmed) {
                promptWithRl();
                return;
              }
              if (newTrimmed.startsWith("/")) {
                const cmdResult = handleCommand(newTrimmed, conversation, model);
                if (cmdResult === "exit") {
                  newRl.close();
                  return;
                }
                promptWithRl();
                return;
              }
              try {
                await runAgent(newTrimmed, conversation, { workingDir, model });
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                console.error(chalk.red(`\nError: ${message}`));
              }
              promptWithRl();
            });
          };
          promptWithRl();
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
