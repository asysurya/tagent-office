/**
 * Path: packages/core/src/tools/bash.ts
 * Purpose: bash tool — blocklisted, jailed-cwd, timeout-guarded shell runs.
 *          The process cwd is always the workspace root; blocked commands
 *          never reach a shell. Output streams are read with a hard deadline
 *          so orphaned grandchild processes holding the pipe cannot hang
 *          the tool after a timeout kill.
 * Dependencies: ./blocklist, ./types, @tagent-office/shared
 */
import { isErr, BASH_TIMEOUT_MS, MAX_TOOL_OUTPUT_CHARS, type Logger } from '@tagent-office/shared';
import { checkBashCommand } from './blocklist';
import type { Tool, ToolExecutionContext, ToolResult } from './types';
import { isRecord, requireString } from './types';

/** Read a stream until EOF, a hard deadline, or the size cap. */
async function readWithDeadline(stream: ReadableStream<Uint8Array> | undefined, deadlineAt: number): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0 || text.length > MAX_TOOL_OUTPUT_CHARS * 2) break;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('deadline')), remaining);
      });
      try {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        text += decoder.decode(value, { stream: true });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  } catch {
    // Deadline reached — keep whatever was collected so far.
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  return text;
}

/** Await process exit with a failsafe deadline (orphaned pipes cannot hang us). */
async function waitForExitWithDeadline(proc: Bun.Subprocess, deadlineAt: number): Promise<number | null> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return null;
  const failsafe = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), remaining);
  });
  const code = await Promise.race([proc.exited, failsafe]);
  return typeof code === 'number' ? code : null;
}

/** Build the bash tool bound to a logger. */
export function createBashTool(options: { timeoutMs?: number; logger?: Logger } = {}): Tool {
  const timeoutMs = options.timeoutMs ?? BASH_TIMEOUT_MS;
  return {
    name: 'bash',
    description:
      'Run a bash command inside the workspace root (cwd = workspace). Output (stdout+stderr, exit code) is returned. Dangerous commands are blocked.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command line to execute.' },
      },
      required: ['command'],
    },
    riskLevel: 'normal',
    async execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> {
      if (!isRecord(args)) return { ok: false, output: 'bash expects a JSON object with a "command" field.' };
      const command = requireString(args, 'command');
      if (command === null) return { ok: false, output: 'bash: "command" must be a non-empty string.' };

      const blocked = checkBashCommand(command);
      if (isErr(blocked)) {
        options.logger?.warn('bash blocklist rejection', blocked.error.toLogFields());
        return { ok: false, output: `bash denied: ${blocked.error.message}` };
      }

      try {
        const proc = Bun.spawn(['bash', '-c', command], {
          cwd: ctx.workspaceRoot,
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: 'ignore',
        });

        let timedOut = false;
        const killTimer = setTimeout(() => {
          timedOut = true;
          try {
            proc.kill();
          } catch {
            // already dead
          }
        }, timeoutMs);
        // Small grace after the kill deadline before we abandon the pipes.
        const hardDeadlineAt = Date.now() + timeoutMs + 500;

        const [stdout, stderr, exitCode] = await Promise.all([
          readWithDeadline(proc.stdout as ReadableStream<Uint8Array> | undefined, hardDeadlineAt),
          readWithDeadline(proc.stderr as ReadableStream<Uint8Array> | undefined, hardDeadlineAt),
          waitForExitWithDeadline(proc, hardDeadlineAt + 1_000),
        ]);
        clearTimeout(killTimer);

        const trimmed = (text: string): string =>
          text.length > MAX_TOOL_OUTPUT_CHARS
            ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n... [truncated]`
            : text;

        const output =
          (timedOut ? `command timed out after ${timeoutMs}ms (killed)\n` : '') +
          `exit code: ${exitCode ?? 'unknown'}\n` +
          (stdout.length > 0 ? `stdout:\n${trimmed(stdout)}` : 'stdout: (empty)\n') +
          (stderr.length > 0 ? `stderr:\n${trimmed(stderr)}` : '');

        return {
          ok: exitCode === 0 && !timedOut,
          output,
          data: { exitCode, timedOut, stdoutChars: stdout.length, stderrChars: stderr.length },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, output: `bash failed to spawn: ${message}` };
      }
    },
  };
}
