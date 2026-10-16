/**
 * Path: /scripts/dev.ts
 * Purpose: Development orchestrator — runs the daemon (port 4020) and the
 *          Next.js web GUI (port 3000) as child processes with prefixed,
 *          line-buffered output. Cleanly kills both on SIGINT/SIGTERM.
 *          Standalone-friendly: no supervisor loop, no auto-restart magic.
 * Dependencies: none (Bun APIs only)
 */
export {};

const DAEMON_CMD = ['bun', 'packages/daemon/src/index.ts'];
const WEB_CMD = ['bun', 'run', 'dev'];
const WEB_CWD = 'apps/web';

interface Child {
  label: string;
  proc: ReturnType<typeof Bun.spawn>;
}

const children: Child[] = [];

/**
 * Pump a child process output stream to stdout with a `[label]` prefix,
 * buffering partial lines until a newline arrives.
 */
async function pump(label: string, stream: ReadableStream<Uint8Array> | undefined): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length > 0) process.stdout.write(`[${label}] ${line}\n`);
    }
  }
  if (buffer.length > 0) process.stdout.write(`[${label}] ${buffer}\n`);
}

/** Spawn a tracked child process. */
function spawnChild(label: string, cmd: string[], cwd?: string): void {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });
  children.push({ label, proc });
  void pump(label, proc.stdout as ReadableStream<Uint8Array>);
  void pump(label, proc.stderr as ReadableStream<Uint8Array>);
  process.stdout.write(`[dev] started ${label}: ${cmd.join(' ')}${cwd ? ` (cwd: ${cwd})` : ''}\n`);
}

function shutdown(code: number): void {
  for (const child of children) {
    try {
      child.proc.kill();
    } catch {
      // already exited — nothing to do
    }
  }
  process.exit(code);
}

spawnChild('daemon', DAEMON_CMD);
spawnChild('web', WEB_CMD, WEB_CWD);

const exitCodes = await Promise.all(
  children.map(async (child) => {
    const code = await child.proc.exited;
    process.stdout.write(`[dev] ${child.label} exited with code ${code}\n`);
    return code;
  }),
);

const failed = exitCodes.find((code) => code !== 0);
shutdown(failed === undefined ? 0 : 1);
