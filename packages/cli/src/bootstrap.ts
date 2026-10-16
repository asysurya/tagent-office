/**
 * Path: packages/cli/src/bootstrap.ts
 * Purpose: Resolve the effective config for a CLI run: config file <- env
 *          <- explicit CLI flags (flags win for the things a user typed).
 *          Ensures storage directories exist before the daemon boots.
 * Dependencies: @tagent-office/shared, node:fs, node:path
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  loadConfig,
  SQLITE_DIRNAME,
  ValidationError,
  WORKSPACES_DIRNAME,
  type LogLevel,
  type TagentConfig,
} from '@tagent-office/shared';

/** Bootstrap inputs (all optional — sensible defaults everywhere). */
export interface BootstrapInput {
  workspace?: string;
  port?: number;
  storage?: string;
  configPath?: string;
  logLevel?: LogLevel;
}

/** Bootstrap result. */
export interface BootstrapResult {
  config: TagentConfig;
  logLevel: LogLevel;
  workspaceRoot: string;
}

/**
 * Load + validate config, apply flag overrides, and create the storage tree.
 * Throws ConfigurationError/ValidationError with actionable messages.
 */
export function bootstrap(input: BootstrapInput): BootstrapResult {
  const config = loadConfig(
    input.configPath !== undefined ? { configPath: input.configPath } : {},
  );

  if (input.workspace !== undefined && input.workspace.length > 0) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(input.workspace)) {
      throw new ValidationError(
        `workspace name must be 1-64 chars of [a-zA-Z0-9_-], got: "${input.workspace}"`,
      );
    }
    config.workspace = input.workspace;
  }
  if (input.port !== undefined) config.port = input.port;
  if (input.storage !== undefined && input.storage.length > 0) config.storage = input.storage;

  const storageRoot = resolve(config.storage);
  mkdirSync(join(storageRoot, SQLITE_DIRNAME), { recursive: true });
  const workspaceRoot = join(storageRoot, WORKSPACES_DIRNAME, config.workspace);
  mkdirSync(workspaceRoot, { recursive: true });

  return { config, logLevel: input.logLevel ?? 'info', workspaceRoot };
}
