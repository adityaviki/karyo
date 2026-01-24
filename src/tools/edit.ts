import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { createTwoFilesPatch } from "diff";
import {
  type ToolDefinition,
  type ToolContext,
  type ToolResult,
} from "../types.js";
import { askPermission } from "../permission.js";

const parameters = z.object({
  file_path: z.string().describe("The absolute path to the file to edit"),
  old_string: z.string().describe("The exact text to find and replace"),
  new_string: z.string().describe("The text to replace it with"),
  replace_all: z
    .boolean()
    .optional()
    .describe("Replace all occurrences (default: false, only replace first)"),
});

type EditParams = z.infer<typeof parameters>;

async function execute(
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const args = rawArgs as EditParams;
  const { file_path, old_string, new_string, replace_all = false } = args;

  // Resolve path
  const resolvedPath = path.isAbsolute(file_path)
    ? file_path
    : path.resolve(ctx.workingDir, file_path);

  try {
    // Read current content
    const content = await fs.readFile(resolvedPath, "utf-8");

    // Check if old_string exists
    if (!content.includes(old_string)) {
      // Try to find similar text
      const lines = content.split("\n");
      const searchLower = old_string.toLowerCase().trim();

      const similarLines = lines
        .map((line, i) => ({ line, num: i + 1 }))
        .filter(({ line }) => {
          const lineLower = line.toLowerCase().trim();
          // Check for partial match
          return (
            lineLower.includes(searchLower.slice(0, 20)) ||
            searchLower.includes(lineLower.slice(0, 20))
          );
        })
        .slice(0, 3);

      let hint = "";
      if (similarLines.length > 0) {
        hint =
          "\n\nSimilar lines found:\n" +
          similarLines
            .map(({ line, num }) => `  Line ${num}: ${line.slice(0, 100)}`)
            .join("\n");
      }

      return {
        output: `Error: Could not find the specified text in ${resolvedPath}${hint}\n\nMake sure the old_string matches exactly, including whitespace and indentation.`,
        isError: true,
      };
    }

    // Count occurrences
    const occurrences = content.split(old_string).length - 1;

    if (occurrences > 1 && !replace_all) {
      return {
        output: `Error: Found ${occurrences} occurrences of the text. Set replace_all=true to replace all, or provide more context to make the match unique.`,
        isError: true,
      };
    }

    // Create new content
    const newContent = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);

    // Generate diff for preview
    const diff = createTwoFilesPatch(
      resolvedPath,
      resolvedPath,
      content,
      newContent,
      "original",
      "modified",
    );

    // Ask permission
    const allowed = await askPermission(
      "edit",
      `Edit file: ${resolvedPath}\n\n${diff}`,
    );

    if (!allowed) {
      return {
        output: "Permission denied by user",
        isError: true,
      };
    }

    // Write changes
    await fs.writeFile(resolvedPath, newContent, "utf-8");

    const replacedCount = replace_all ? occurrences : 1;

    return {
      output: `Successfully edited ${resolvedPath}\nReplaced ${replacedCount} occurrence(s)\n\n${diff}`,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        output: `Error: File not found: ${resolvedPath}`,
        isError: true,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      output: `Error editing file: ${message}`,
      isError: true,
    };
  }
}

export const editTool: ToolDefinition = {
  name: "edit",
  description:
    "Edit a file by finding and replacing text. " +
    "The old_string must match exactly (including whitespace). " +
    "Shows a diff preview and asks for confirmation before applying changes. " +
    "Use replace_all=true to replace all occurrences.",
  parameters,
  execute,
};
