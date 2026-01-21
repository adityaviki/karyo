import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { type ToolDefinition, type ToolContext, type ToolResult } from "../types.js";
import { askPermission } from "../permission.js";

const parameters = z.object({
  file_path: z.string().describe("The absolute path to the file to write"),
  content: z.string().describe("The content to write to the file"),
});

type WriteParams = z.infer<typeof parameters>;

async function execute(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = parameters.parse(rawArgs) as WriteParams;
  const { file_path, content } = args;

  // Resolve path
  const resolvedPath = path.isAbsolute(file_path)
    ? file_path
    : path.resolve(ctx.workingDir, file_path);

  try {
    // Check if file already exists
    let fileExists = false;
    try {
      await fs.access(resolvedPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    // Ask permission if overwriting
    if (fileExists) {
      const allowed = await askPermission(
        "write",
        `Overwrite existing file: ${resolvedPath}`
      );
      if (!allowed) {
        return {
          output: "Permission denied by user",
          isError: true,
        };
      }
    }

    // Ensure parent directory exists
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(resolvedPath, content, "utf-8");

    const lines = content.split("\n").length;
    const bytes = Buffer.byteLength(content, "utf-8");

    return {
      output: `Successfully wrote ${lines} lines (${bytes} bytes) to ${resolvedPath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Error writing file: ${message}`,
      isError: true,
    };
  }
}

export const writeTool: ToolDefinition = {
  name: "write",
  description:
    "Write content to a file. Creates the file if it doesn't exist, " +
    "or overwrites it if it does (with user confirmation). " +
    "Parent directories are created automatically if needed.",
  parameters,
  execute,
};
