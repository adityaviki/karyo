import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { type ToolDefinition, type ToolContext, type ToolResult } from "../types.js";

const parameters = z.object({
  file_path: z.string().describe("The absolute path to the file to read"),
  offset: z
    .number()
    .optional()
    .describe("Line number to start reading from (1-indexed)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of lines to read (default: 2000)"),
});

type ReadParams = z.infer<typeof parameters>;

async function execute(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = parameters.parse(rawArgs) as ReadParams;
  const { file_path, offset = 1, limit = 2000 } = args;

  // Resolve path relative to working directory if not absolute
  const resolvedPath = path.isAbsolute(file_path)
    ? file_path
    : path.resolve(ctx.workingDir, file_path);

  try {
    // Check if file exists
    const stat = await fs.stat(resolvedPath);

    if (stat.isDirectory()) {
      return {
        output: `Error: "${resolvedPath}" is a directory, not a file. Use the glob or bash tool to list directory contents.`,
        isError: true,
      };
    }

    // Check for binary files by extension
    const binaryExtensions = [
      ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
      ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
      ".exe", ".dll", ".so", ".dylib",
      ".mp3", ".mp4", ".avi", ".mov", ".wav",
      ".ttf", ".otf", ".woff", ".woff2",
    ];

    const ext = path.extname(resolvedPath).toLowerCase();
    if (binaryExtensions.includes(ext)) {
      return {
        output: `Error: "${resolvedPath}" appears to be a binary file (${ext}). Cannot display binary content.`,
        isError: true,
      };
    }

    // Read file content
    const content = await fs.readFile(resolvedPath, "utf-8");
    const lines = content.split("\n");

    // Apply offset and limit
    const startIndex = Math.max(0, offset - 1);
    const endIndex = Math.min(lines.length, startIndex + limit);
    const selectedLines = lines.slice(startIndex, endIndex);

    // Format with line numbers
    const maxLineNum = endIndex;
    const lineNumWidth = String(maxLineNum).length;

    const formattedLines = selectedLines.map((line, i) => {
      const lineNum = String(startIndex + i + 1).padStart(lineNumWidth, " ");
      // Truncate very long lines
      const truncatedLine = line.length > 2000 ? line.slice(0, 2000) + "..." : line;
      return `${lineNum}\t${truncatedLine}`;
    });

    let output = formattedLines.join("\n");

    // Add truncation notice if needed
    if (endIndex < lines.length) {
      output += `\n\n[Truncated: showing lines ${offset}-${endIndex} of ${lines.length}. Use offset/limit to read more.]`;
    }

    return { output };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Try to suggest similar files
      const dir = path.dirname(resolvedPath);
      const filename = path.basename(resolvedPath);

      try {
        const files = await fs.readdir(dir);
        const similar = files
          .filter((f) => f.toLowerCase().includes(filename.toLowerCase().slice(0, 3)))
          .slice(0, 5);

        if (similar.length > 0) {
          return {
            output: `Error: File not found: "${resolvedPath}"\n\nDid you mean one of these?\n${similar.map((f) => `  - ${path.join(dir, f)}`).join("\n")}`,
            isError: true,
          };
        }
      } catch {
        // Ignore errors when trying to list directory
      }

      return {
        output: `Error: File not found: "${resolvedPath}"`,
        isError: true,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Error reading file: ${message}`,
      isError: true,
    };
  }
}

export const readTool: ToolDefinition = {
  name: "read",
  description:
    "Read the contents of a file. Returns the file content with line numbers. " +
    "Use offset and limit parameters to read specific portions of large files.",
  parameters,
  execute,
};
