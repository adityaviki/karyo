import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import chalk from "chalk";

const AUTH_FILE = path.join(process.env.HOME || "~", ".simple-agent-auth.json");

// Auth token type
export interface AuthToken {
  key: string;
}

// Load saved auth
export async function loadAuth(): Promise<AuthToken | null> {
  try {
    const data = await fs.readFile(AUTH_FILE, "utf-8");
    return JSON.parse(data) as AuthToken;
  } catch {
    return null;
  }
}

// Save auth
export async function saveAuth(token: AuthToken): Promise<void> {
  await fs.writeFile(AUTH_FILE, JSON.stringify(token, null, 2));
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
  console.log(chalk.bold("\nClaude Authentication\n"));

  const key = await prompt("Enter your Anthropic API key: ");
  if (!key) {
    console.log(chalk.red("No key provided."));
    return false;
  }

  await saveAuth({ key });
  console.log(chalk.green("API key saved!"));
  return true;
}

// Check auth status
export async function status(): Promise<void> {
  const auth = await loadAuth();

  if (!auth) {
    console.log(chalk.yellow("Not authenticated. Run with --login to authenticate."));
    return;
  }

  console.log(chalk.green("Authenticated with API key"));
  console.log(chalk.gray(`Key: ${auth.key.slice(0, 10)}...`));
}

// Logout
export async function logout(): Promise<void> {
  await clearAuth();
  console.log(chalk.green("Logged out successfully."));
}
