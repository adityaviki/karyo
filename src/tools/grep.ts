import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { type ToolDefinition, type ToolContext, type ToolResult } from "../types.js";

const parameters = z.object({
  pattern: z.string().describe("Regular expression pattern to search for"),
  directory: z
    .string()
    .optional()
    .describe("Directory to search in (defaults to working directory)"),
  include: z
    .string()
    .optional()
    .describe("Glob pattern to filter files (e.g., '*.ts', '*.{js,jsx}')"),
});

type GrepParams = z.infer<typeof parameters>;

interface Match {
  file: string;
  line: number;
  content: string;
}

async function execute(rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = parameters.parse(rawArgs) as GrepParams;
  const { pattern, directory, include } = args;

  // Resolve directory
  const searchDir = directory
    ? path.isAbsolute(directory)
      ? directory
      : path.resolve(ctx.workingDir, directory)
    : ctx.workingDir;

  try {
    // Compile regex
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "gi");
    } catch (e) {
      return {
        output: `Error: Invalid regular expression "${pattern}": ${e instanceof Error ? e.message : String(e)}`,
        isError: true,
      };
    }

    // Find files to search
    const filePattern = include || "**/*";
    const files = await glob(filePattern, {
      cwd: searchDir,
      absolute: true,
      nodir: true,
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/coverage/**",
        "**/*.min.js",
        "**/*.map",
        "**/package-lock.json",
        "**/yarn.lock",
        "**/pnpm-lock.yaml",
      ],
    });

    // Binary extensions to skip
    const binaryExtensions = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
      ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
      ".exe", ".dll", ".so", ".dylib",
      ".mp3", ".mp4", ".avi", ".mov", ".wav",
      ".ttf", ".otf", ".woff", ".woff2",
    ]);

    const matches: Match[] = [];
    const maxMatches = 100;
    const maxFileSize = 1024 * 1024; // 1MB

    // Search files
    for (const file of files) {
      if (matches.length >= maxMatches) break;

      const ext = path.extname(file).toLowerCase();
      if (binaryExtensions.has(ext)) continue;

      try {
        const stat = await fs.stat(file);
        if (stat.size > maxFileSize) continue;

        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
          if (regex.test(lines[i])) {
            matches.push({
              file,
              line: i + 1,
              content: lines[i].trim().slice(0, 200), // Truncate long lines
            });
          }
          // Reset regex lastIndex for global flag
          regex.lastIndex = 0;
        }
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    if (matches.length === 0) {
      return {
        output: `No matches found for pattern "${pattern}" in ${searchDir}`,
      };
    }

    // Group matches by file
    const groupedMatches = new Map<string, Match[]>();
    for (const match of matches) {
      const existing = groupedMatches.get(match.file) || [];
      existing.push(match);
      groupedMatches.set(match.file, existing);
    }

    // Format output
    const lines: string[] = [];
    for (const [file, fileMatches] of groupedMatches) {
      lines.push(`\n${file}:`);
      for (const match of fileMatches) {
        lines.push(`  ${match.line}: ${match.content}`);
      }
    }

    let output = lines.join("\n").trim();

    if (matches.length >= maxMatches) {
      output += `\n\n[Showing first ${maxMatches} matches. Refine your pattern for more specific results.]`;
    }

    return { output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Error searching files: ${message}`,
      isError: true,
    };
  }
}

export const grepTool: ToolDefinition = {
  name: "grep",
  description:
    "Search for a pattern in files using regular expressions. " +
    "Returns matching lines with file paths and line numbers. " +
    "Use the 'include' parameter to filter by file extension (e.g., '*.ts').",
  parameters,
  execute,
};
