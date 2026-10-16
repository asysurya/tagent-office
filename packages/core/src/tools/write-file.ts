/**
 * Path: packages/core/src/tools/write-file.ts
 * Purpose: write_file tool — jailed writes. The path is validated LOGICALLY
 *          first; only then are parent directories auto-created and content
 *          written (anti-pattern #7: never mkdir before the jail check).
 * Dependencies: node:fs, ./jail, ./types, @tagent-office/shared
 */
import { writeFileSync } from 'node:fs';
import { isErr, type Logger } from '@tagent-office/shared';
import { ensureParentDir, resolveJailedPath } from './jail';
import type { Tool, ToolExecutionContext, ToolResult } from './types';
import { isRecord, requireString } from './types';

/** Build the write_file tool bound to a logger. */
export function createWriteFileTool(logger?: Logger): Tool {
  return {
    name: 'write_file',
    description:
      'Write a UTF-8 text file inside the workspace, creating parent directories as needed. Overwrites existing content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path, e.g. "src/hello.txt"' },
        content: { type: 'string', description: 'Full file content to write.' },
      },
      required: ['path', 'content'],
    },
    riskLevel: 'normal',
    async execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> {
      if (!isRecord(args)) {
        return { ok: false, output: 'write_file expects a JSON object with "path" and "content" fields.' };
      }
      const path = requireString(args, 'path');
      if (path === null) return { ok: false, output: 'write_file: "path" must be a non-empty string.' };
      const content = args['content'];
      if (typeof content !== 'string') {
        return { ok: false, output: 'write_file: "content" must be a string.' };
      }

      const jailed = resolveJailedPath(ctx.workspaceRoot, path);
      if (isErr(jailed)) {
        logger?.warn('write_file jail rejection', jailed.error.toLogFields());
        return { ok: false, output: `write_file denied: ${jailed.error.message}` };
      }

      const parent = ensureParentDir(jailed.value.abs);
      if (isErr(parent)) {
        return { ok: false, output: `write_file could not create parent directory: ${parent.error.message}` };
      }

      try {
        writeFileSync(jailed.value.abs, content, 'utf-8');
        const bytes = Buffer.byteLength(content, 'utf-8');
        return {
          ok: true,
          output: `Wrote ${bytes} bytes to ${jailed.value.rel}`,
          data: { path: jailed.value.rel, bytes },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, output: `write_file failed: ${message}` };
      }
    },
  };
}
