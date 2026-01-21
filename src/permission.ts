import * as readline from "readline";

// Patterns that require user confirmation
const DANGEROUS_BASH_PATTERNS = [
  /^rm\s/,
  /^rm$/,
  /\brm\s+-rf?\s/,
  /\brmdir\b/,
  /^sudo\s/,
  /^su\s/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\b/,
  /\bdd\s/,
  /\bmkfs\b/,
  />\s*\/dev\//,
  /\bkill\s+-9\b/,
  /\bpkill\b/,
  /\bshutdown\b/,
  /\breboot\b/,
];

// Track patterns that user has approved for this session
const approvedPatterns = new Set<string>();

// Check if a bash command is dangerous
export function isDangerousCommand(command: string): boolean {
  const trimmed = command.trim().toLowerCase();
  return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// Ask user for permission
export async function askPermission(
  action: string,
  details: string
): Promise<boolean> {
  // Check if already approved
  const key = `${action}:${details}`;
  if (approvedPatterns.has(key)) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n" + "=".repeat(60));
    console.log(`Permission required: ${action}`);
    console.log("-".repeat(60));
    console.log(details);
    console.log("=".repeat(60));

    rl.question("Allow? [y/N/always] ", (answer) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();

      if (normalized === "y" || normalized === "yes") {
        resolve(true);
      } else if (normalized === "always" || normalized === "a") {
        approvedPatterns.add(key);
        console.log("(Approved for this session)");
        resolve(true);
      } else {
        console.log("(Denied)");
        resolve(false);
      }
    });
  });
}

// Reset approved patterns (useful for testing)
export function resetApprovedPatterns(): void {
  approvedPatterns.clear();
}
