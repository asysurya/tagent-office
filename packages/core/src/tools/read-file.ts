/**
 * Path: packages/core/src/tools/read-file.ts
 * Purpose: read_file tool — jailed reads with a size cap and truncation.
 * Dependencies: node:fs, ./jail, ./types, @tagent-office/shared
 */
import { readFileSync, statSync } from 'node:fs';
import { isErr, type Logger } from '@tagent-office/shared';
import { MAX_FILE_READ_BYTES, MAX_TOOL_OUTPUT_CHARS } from '@tagent-office/shared';
import { resolveJailedPath } from './jail';
import type { Tool, ToolExecutionContext, ToolResult } from './types';
import { isRecord, requireString } from './types';

/** Build the read_file tool bound to a logger. */
export function createReadFileTool(logger?: Logger): Tool {
  return {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the workspace. Returns the file content (truncated when larger than 1 MiB).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path, e.g. "src/index.ts"' },
      },
      required: ['path'],
    },
    riskLevel: 'safe',
    async execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> {
      if (!isRecord(args)) return { ok: false, output: 'read_file expects a JSON object with a "path" field.' };
      const path = requireString(args, 'path');
      if (path === null) return { ok: false, output: 'read_file: "path" must be a non-empty string.' };

      const jailed = resolveJailedPath(ctx.workspaceRoot, path);
      if (isErr(jailed)) {
        logger?.warn('read_file jail rejection', jailed.error.toLogFields());
        return { ok: false, output: `read_file denied: ${jailed.error.message}` };
      }

      try {
        const stats = statSync(jailed.value.abs);
        if (!stats.isFile()) {
          return { ok: false, output: `read_file: not a regular file: ${jailed.value.rel}` };
        }
        const truncatedBySize = stats.size > MAX_FILE_READ_BYTES;
        const content = readFileSync(jailed.value.abs, {
          encoding: 'utf-8',
          // Read at most one byte over the cap so truncation is detectable.
        }).slice(0, MAX_FILE_READ_BYTES);

        const output =
          content.length > MAX_TOOL_OUTPUT_CHARS
            ? `${content.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n... [truncated]`
            : content;
        return {
          ok: true,
          output: output.length > 0 ? output : '(empty file)',
          data: { path: jailed.value.rel, bytes: stats.size, truncated: truncatedBySize },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, output: `read_file failed: ${message}` };
      }
    },
  };
}
