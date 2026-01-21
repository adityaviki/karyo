import { z } from "zod";
import { glob } from "glob";
import * as path from "path";
import * as fs from "fs/promises";
import { type ToolDefinition, type ToolContext, type ToolResult } from "../types.js";

const parameters = z.object({
  pattern: z.string().describe("Glob pattern to match files (e.g., '**/*.ts', 'src/*.js')"),
  directory: z
    .string()
    .optional()
    .describe("Directory to search in (defaults to working directory)"),
});

type GlobParams = z.infer<typeof parameters>;

async function execute(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = parameters.parse(rawArgs) as GlobParams;
  const { pattern, directory } = args;

  // Resolve directory
  const searchDir = directory
    ? path.isAbsolute(directory)
      ? directory
      : path.resolve(ctx.workingDir, directory)
    : ctx.workingDir;

  try {
    // Check if directory exists
    const stat = await fs.stat(searchDir);
    if (!stat.isDirectory()) {
      return {
        output: `Error: "${searchDir}" is not a directory`,
        isError: true,
      };
    }

    // Run glob search
    const matches = await glob(pattern, {
      cwd: searchDir,
      absolute: true,
      nodir: true, // Only match files, not directories
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/coverage/**",
      ],
    });

    if (matches.length === 0) {
      return {
        output: `No files found matching pattern "${pattern}" in ${searchDir}`,
      };
    }

    // Get file stats for sorting by modification time
    const filesWithStats = await Promise.all(
      matches.map(async (filePath) => {
        try {
          const stat = await fs.stat(filePath);
          return { path: filePath, mtime: stat.mtime };
        } catch {
          return { path: filePath, mtime: new Date(0) };
        }
      })
    );

    // Sort by modification time (most recent first)
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Limit results
    const maxResults = 100;
    const limitedFiles = filesWithStats.slice(0, maxResults);

    // Format output
    const fileList = limitedFiles.map((f) => f.path).join("\n");

    let output = fileList;

    if (filesWithStats.length > maxResults) {
      output += `\n\n[Showing ${maxResults} of ${filesWithStats.length} matches. Refine your pattern to see more specific results.]`;
    }

    return { output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Error searching for files: ${message}`,
      isError: true,
    };
  }
}

export const globTool: ToolDefinition = {
  name: "glob",
  description:
    "Find files matching a glob pattern. Returns absolute paths sorted by modification time (most recent first). " +
    "Automatically ignores node_modules, .git, dist, and other common build directories.",
  parameters,
  execute,
};
