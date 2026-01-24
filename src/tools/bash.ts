import { z } from "zod";
import { spawn } from "child_process";
import { type ToolDefinition, type ToolContext, type ToolResult } from "../types.js";
import { isDangerousCommand, askPermission } from "../permission.js";

const parameters = z.object({
  command: z.string().describe("The bash command to execute"),
  timeout: z
    .number()
    .optional()
    .describe("Timeout in milliseconds (default: 120000 = 2 minutes)"),
});

type BashParams = z.infer<typeof parameters>;

async function execute(rawArgs: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const args = rawArgs as BashParams;
  const { command, timeout = 120000 } = args;

  // Check for dangerous commands
  if (isDangerousCommand(command)) {
    const allowed = await askPermission("bash", `Execute command: ${command}`);
    if (!allowed) {
      return {
        output: "Permission denied by user",
        isError: true,
      };
    }
  }

  return new Promise((resolve) => {
    const output: string[] = [];
    const errorOutput: string[] = [];

    // Find shell
    const shell = process.env.SHELL || "/bin/bash";

    const proc = spawn(shell, ["-c", command], {
      cwd: ctx.workingDir,
      env: {
        ...process.env,
        // Force color output for many tools
        FORCE_COLOR: "1",
        TERM: "xterm-256color",
      },
      timeout,
    });

    // Handle abort signal
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      output.push(text);
      // Stream output to console for visibility
      process.stdout.write(text);
    });

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      errorOutput.push(text);
      // Stream stderr to console
      process.stderr.write(text);
    });

    proc.on("error", (error) => {
      resolve({
        output: `Error executing command: ${error.message}`,
        isError: true,
      });
    });

    proc.on("close", (code) => {
      const stdout = output.join("");
      const stderr = errorOutput.join("");

      let result = "";

      if (stdout) {
        result += stdout;
      }

      if (stderr) {
        if (result) result += "\n";
        result += stderr;
      }

      // Truncate very long output
      const maxLength = 30000;
      if (result.length > maxLength) {
        result = result.slice(0, maxLength) + "\n\n[Output truncated...]";
      }

      if (!result) {
        result = code === 0 ? "(Command completed successfully with no output)" : "(No output)";
      }

      if (code !== 0) {
        result += `\n\nExit code: ${code}`;
      }

      resolve({
        output: result,
        isError: code !== 0,
      });
    });

    // Handle timeout
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({
        output: `Command timed out after ${timeout}ms`,
        isError: true,
      });
    }, timeout);
  });
}

export const bashTool: ToolDefinition = {
  name: "bash",
  description:
    "Execute a bash command in the working directory. " +
    "Dangerous commands (rm, sudo, git push, etc.) will prompt for user confirmation. " +
    "Output is streamed to the console and returned. Default timeout is 2 minutes.",
  parameters,
  execute,
};
