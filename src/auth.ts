import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import chalk from "chalk";

const AUTH_FILE = path.join(process.env.HOME || "~", ".karyo-auth.json");

// Auth token type - supports multiple providers
export interface AuthToken {
  anthropic?: string;
  google?: string;
  openai?: string;
}

// Load saved auth
export async function loadAuth(): Promise<AuthToken | null> {
  try {
    const data = await fs.readFile(AUTH_FILE, "utf-8");
    const parsed = JSON.parse(data);
    // Handle legacy format (single key or gemini)
    if (parsed.key && !parsed.anthropic) {
      return { anthropic: parsed.key };
    }
    if (parsed.gemini && !parsed.google) {
      return { ...parsed, google: parsed.gemini };
    }
    return parsed as AuthToken;
  } catch {
    return null;
  }
}

// Save auth
export async function saveAuth(token: AuthToken): Promise<void> {
  const existing = (await loadAuth()) || {};
  const merged = { ...existing, ...token };
  await fs.writeFile(AUTH_FILE, JSON.stringify(merged, null, 2));
}

// Clear auth
export async function clearAuth(): Promise<void> {
  try {
    await fs.unlink(AUTH_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

// Prompt user for input
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Login flow
export async function login(): Promise<boolean> {
  console.log(chalk.bold("\nKaryo Authentication\n"));
  console.log("1. Anthropic API key (for Claude models)");
  console.log("2. Google API key (for Gemini models)");
  console.log("3. OpenAI API key (for GPT models)");
  console.log("4. Cancel\n");

  const choice = await prompt("Choose option (1-4): ");

  if (choice === "4" || !choice) {
    console.log(chalk.yellow("Cancelled."));
    return false;
  }

  if (choice === "1") {
    const key = await prompt("Enter your Anthropic API key: ");
    if (!key) {
      console.log(chalk.red("No key provided."));
      return false;
    }
    await saveAuth({ anthropic: key });
    console.log(chalk.green("Anthropic API key saved!"));
    return true;
  }

  if (choice === "2") {
    const key = await prompt("Enter your Google API key: ");
    if (!key) {
      console.log(chalk.red("No key provided."));
      return false;
    }
    await saveAuth({ google: key });
    console.log(chalk.green("Google API key saved!"));
    return true;
  }

  if (choice === "3") {
    const key = await prompt("Enter your OpenAI API key: ");
    if (!key) {
      console.log(chalk.red("No key provided."));
      return false;
    }
    await saveAuth({ openai: key });
    console.log(chalk.green("OpenAI API key saved!"));
    return true;
  }

  console.log(chalk.red("Invalid option."));
  return false;
}

// Check auth status
export async function status(): Promise<void> {
  const auth = await loadAuth();

  if (!auth || (!auth.anthropic && !auth.google && !auth.openai)) {
    console.log(
      chalk.yellow("Not authenticated. Run with --login to authenticate.")
    );
    return;
  }

  console.log(chalk.bold("\nConfigured API keys:"));
  if (auth.anthropic) {
    console.log(chalk.green(`  Anthropic: ${auth.anthropic.slice(0, 15)}...`));
  }
  if (auth.google) {
    console.log(chalk.green(`  Google: ${auth.google.slice(0, 15)}...`));
  }
  if (auth.openai) {
    console.log(chalk.green(`  OpenAI: ${auth.openai.slice(0, 15)}...`));
  }
  console.log();
}

// Logout
export async function logout(): Promise<void> {
  await clearAuth();
  console.log(chalk.green("Logged out successfully."));
}
