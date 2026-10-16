/**
 * Path: packages/cli/src/commands/start.ts
 * Purpose: `tagent-office start` — boot storage, then the daemon in-process
 *          (HTTP + socket.io on one port), keep running until SIGINT/SIGTERM.
 *          The daemon is standalone by design: no supervisor loop
 *          (anti-pattern #9).
 * Dependencies: ../bootstrap, @tagent-office/daemon, @tagent-office/shared
 */
import { parseArgs } from 'node:util';
import { APP_VERSION } from '@tagent-office/shared';
import { bootDaemon } from '@tagent-office/daemon';
import { bootstrap, type BootstrapInput } from '../bootstrap';

/** Options accepted by parseArgs. */
const OPTIONS = {
  port: { type: 'string' },
  storage: { type: 'string' },
  config: { type: 'string' },
  'log-level': { type: 'string' },
} as const;

const LOG_LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error'];

/** Parse with full inference so values and positionals stay precise. */
function parseStartArgs(argv: string[]) {
  return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
}

/** Run the start command with the remaining argv. */
export function startCommand(argv: string[]): void {
  let parsed: ReturnType<typeof parseStartArgs>;
  try {
    parsed = parseStartArgs(argv);
  } catch (error: unknown) {
    process.stderr.write(`Invalid arguments: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const positionals = parsed.positionals;
  if (positionals.length > 1) {
    process.stderr.write('Usage: tagent-office start [workspace] [options]\n');
    process.exit(1);
  }

  let port: number | undefined;
  if (parsed.values.port !== undefined) {
    port = Number.parseInt(parsed.values.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      process.stderr.write(`--port must be an integer in [1, 65535], got: ${parsed.values.port}\n`);
      process.exit(1);
    }
  }

  let logLevel: BootstrapInput['logLevel'];
  if (parsed.values['log-level'] !== undefined) {
    const level = parsed.values['log-level'];
    if (!LOG_LEVELS.includes(level)) {
      process.stderr.write(`--log-level must be one of ${LOG_LEVELS.join('|')}, got: ${level}\n`);
      process.exit(1);
    }
    logLevel = level as BootstrapInput['logLevel'];
  }

  const input: BootstrapInput = {
    workspace: positionals[0],
    port,
    storage: parsed.values.storage,
    configPath: parsed.values.config,
    logLevel,
  };

  void (async (): Promise<void> => {
    try {
      const bootstrapped = bootstrap(input);
      const handle = await bootDaemon({ config: bootstrapped.config, logLevel: bootstrapped.logLevel });
      process.stdout.write(
        [
          '',
          `  Tagent Office v${APP_VERSION}`,
          `  API + realtime : http://localhost:${handle.port}  (socket.io path /socket.io)`,
          `  GUI (next dev)  : http://localhost:3000`,
          `  Workspace       : ${bootstrapped.workspaceRoot}`,
          `  Provider        : ${bootstrapped.config.defaultProvider} / ${bootstrapped.config.defaultModel}`,
          '',
        ].join('\n'),
      );

      const shutdown = (signal: string): void => {
        process.stdout.write(`\n[tagent-office] received ${signal}, shutting down...\n`);
        void handle
          .close()
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    } catch (error: unknown) {
      process.stderr.write(`Failed to start tagent-office: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(2);
    }
  })();
}
