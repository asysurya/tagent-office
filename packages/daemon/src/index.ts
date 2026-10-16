/**
 * Path: packages/daemon/src/index.ts
 * Purpose: Daemon entrypoint. Standalone by design (anti-pattern #9): run
 *          `bun packages/daemon/src/index.ts` and it boots on the configured
 *          port (default 4020) with no supervisor loop. Also exports
 *          startDaemon + createApp for the CLI and tests.
 * Dependencies: ./runtime, ./server, @tagent-office/shared
 */
import { loadConfig } from '@tagent-office/shared';
import type { TagentConfig } from '@tagent-office/shared';
import { createRuntime } from './runtime';
import { startDaemon, type DaemonHandle } from './server';

export { createApp, startDaemon, type DaemonHandle, type StartDaemonOptions } from './server';
export { createRuntime, type Runtime } from './runtime';

/** Options for the top-level boot. */
export interface BootOptions {
  /** Fully resolved config; defaults to loadConfig() so env overrides apply. */
  config?: TagentConfig;
  /** Port override (0 = ephemeral, used by tests). */
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/** Boot the full daemon: runtime + http + socket.io + manager + workers. */
export async function bootDaemon(options: BootOptions = {}): Promise<DaemonHandle> {
  // CRITICAL: never fall back to raw DEFAULT_CONFIG here — env overrides
  // (TAGENT_OFFICE_BASE_URL / API_KEY / MODEL) must reach the standalone
  // entry too, or real providers silently never load.
  const config = options.config ?? loadConfig();
  const runtime = createRuntime({ config, ...(options.logLevel !== undefined ? { logLevel: options.logLevel } : {}) });

  const handle = await startDaemon({ runtime, ...(options.port !== undefined ? { port: options.port } : {}) });

  await runtime.pool.start();
  runtime.manager.start();
  runtime.logger.info('daemon ready', {
    port: handle.port,
    workspace: config.workspace,
    storage: config.storage,
    provider: config.defaultProvider,
    model: config.defaultModel,
  });
  return handle;
}

// Standalone entry: `bun packages/daemon/src/index.ts`.
if (import.meta.main) {
  const handle = await bootDaemon();
  const shutdown = (signal: string): void => {
    process.stdout.write(`\n[tagent-office] received ${signal}, shutting down...\n`);
    void handle
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
