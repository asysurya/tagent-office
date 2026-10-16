/**
 * Path: packages/shared/src/config-loader.ts
 * Purpose: Load Tagent Office configuration: defaults <- JSON file <- env.
 *          Environment variables always win (PRD 2.21). "${ENV_VAR}"
 *          references inside provider configs are resolved at load time.
 * Dependencies: ./types/config, ./errors, ./constants
 */
import { existsSync, readFileSync } from 'node:fs';
import { CONFIG_FILENAME, DEFAULT_PORT, DEFAULT_WORKSPACE_NAME, DEFAULT_STORAGE_DIR } from './constants';
import { ConfigurationError, ValidationError } from './errors';
import type { ProviderConfig, RoleName, TagentConfig } from './types/config';

/** Default configuration — fully functional with the mock provider, zero keys. */
export const DEFAULT_CONFIG: TagentConfig = {
  version: '1.0.0',
  port: DEFAULT_PORT,
  storage: DEFAULT_STORAGE_DIR,
  workspace: DEFAULT_WORKSPACE_NAME,
  telemetry: false,
  autoUpdate: true,
  defaultProvider: 'mock',
  defaultModel: 'mock-echo-1',
  providers: {
    mock: { type: 'mock', apiKey: 'unused', models: ['mock-echo-1'] },
  },
  roles: {
    manager: { primary: 'mock/mock-echo-1', fallbacks: [] },
    frontend: { primary: 'mock/mock-echo-1', fallbacks: [] },
    backend: { primary: 'mock/mock-echo-1', fallbacks: [] },
    qa: { primary: 'mock/mock-echo-1', fallbacks: [] },
    vision: { primary: 'mock/mock-echo-1', fallbacks: [] },
  },
  permissions: {
    tools: { read_file: 'allow', write_file: 'allow', bash: 'allow' },
    autoApproveAsk: true,
  },
  performance: {
    tier: 'auto',
    maxWorkers: 4,
    maxQA: 2,
    workerRoles: ['frontend', 'backend'],
  },
};

export interface LoadConfigOptions {
  /** Explicit config file path. Defaults to env TAGENT_OFFICE_CONFIG then ./tagent-office.config.json */
  configPath?: string;
  /** Environment map (defaults to process.env). Injectable for tests. */
  env?: Record<string, string | undefined>;
}

/** Deep-merge source into target. Objects merge; arrays and scalars replace. */
function deepMerge<T>(target: T, source: unknown): T {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return (source === undefined ? target : (source as T));
  }
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    return structuredClone(source) as T;
  }
  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const targetValue = result[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
        && targetValue !== null && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
      result[key] = deepMerge(targetValue, value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result as T;
}

/** Replace "${VAR}" (and "${VAR:-default}") references using the env map. */
function resolveEnvRefs(value: unknown, env: Record<string, string | undefined>, path: string): unknown {
  if (typeof value === 'string') {
    const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*))?\}$/.exec(value);
    if (match === null) return value;
    const name = match[1] ?? '';
    const fallback = match[2];
    const resolved = env[name];
    if (resolved !== undefined && resolved !== '') return resolved;
    if (fallback !== undefined) return fallback;
    throw new ConfigurationError(`Environment variable ${name} is not set (referenced at ${path})`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => resolveEnvRefs(item, env, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveEnvRefs(item, env, `${path}.${key}`);
    }
    return out;
  }
  return value;
}

/** Validate the final config; throws ValidationError on any inconsistency. */
function validateConfig(config: TagentConfig): void {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    throw new ValidationError(`port must be an integer in [1, 65535], got: ${String(config.port)}`);
  }
  if (config.defaultProvider.length === 0) {
    throw new ValidationError('defaultProvider must not be empty');
  }
  const provider = config.providers[config.defaultProvider];
  if (provider === undefined) {
    throw new ValidationError(`defaultProvider "${config.defaultProvider}" is not defined in providers`);
  }
  if (config.defaultModel.length === 0) {
    throw new ValidationError('defaultModel must not be empty');
  }
  for (const [roleName, role] of Object.entries(config.roles) as [RoleName, { primary: string; fallbacks: string[] }][]) {
    const refs = [role.primary, ...role.fallbacks];
    for (const ref of refs) {
      const [providerId, ...modelParts] = ref.split('/');
      if (providerId === undefined || modelParts.length === 0) {
        throw new ValidationError(`roles.${roleName} has invalid model ref "${ref}" (expected "provider/model")`);
      }
      if (config.providers[providerId] === undefined) {
        throw new ValidationError(`roles.${roleName} references unknown provider "${providerId}"`);
      }
    }
  }
}

/**
 * Load configuration: defaults, then optional JSON file, then env overrides.
 * Returns the merged config or a ConfigurationError/ValidationError.
 */
export function loadConfig(options: LoadConfigOptions = {}): TagentConfig {
  const env = options.env ?? process.env;
  const filePath = options.configPath ?? env['TAGENT_OFFICE_CONFIG'] ?? CONFIG_FILENAME;

  let config = structuredClone(DEFAULT_CONFIG);

  if (typeof filePath === 'string' && filePath.length > 0) {
    if (existsSync(filePath)) {
      try {
        const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
        config = deepMerge(config, raw);
      } catch (error: unknown) {
        throw new ConfigurationError(
          `Failed to parse config file ${filePath}`,
          { cause: error instanceof Error ? error.message : String(error) },
        );
      }
    }
  }

  config = resolveEnvRefs(config, env, 'config') as TagentConfig;

  applyEnvOverrides(config, env);
  validateConfig(config);
  return config;
}

/** Mutates config in place from TAGENT_OFFICE_* env vars (env always wins). */
function applyEnvOverrides(config: TagentConfig, env: Record<string, string | undefined>): void {
  const port = env['TAGENT_OFFICE_PORT'];
  if (port !== undefined && port !== '') {
    const parsed = Number.parseInt(port, 10);
    if (!Number.isFinite(parsed)) throw new ConfigurationError(`TAGENT_OFFICE_PORT is not a number: ${port}`);
    config.port = parsed;
  }
  const storage = env['TAGENT_OFFICE_STORAGE'];
  if (storage !== undefined && storage !== '') config.storage = storage;

  const workspace = env['TAGENT_OFFICE_WORKSPACE'];
  if (workspace !== undefined && workspace !== '') config.workspace = workspace;

  const telemetry = env['TAGENT_OFFICE_TELEMETRY'];
  if (telemetry !== undefined && telemetry !== '') config.telemetry = telemetry === 'true';

  const maxWorkers = env['TAGENT_OFFICE_MAX_WORKERS'];
  if (maxWorkers !== undefined && maxWorkers !== '') {
    const parsed = Number.parseInt(maxWorkers, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new ConfigurationError(`TAGENT_OFFICE_MAX_WORKERS must be a positive integer: ${maxWorkers}`);
    }
    config.performance.maxWorkers = parsed;
  }

  const baseURL = env['TAGENT_OFFICE_BASE_URL'];
  const apiKey = env['TAGENT_OFFICE_API_KEY'];
  const model = env['TAGENT_OFFICE_MODEL'];

  if (baseURL !== undefined && baseURL !== '') {
    // Env BASE_URL switches to an openai-compatible "custom" provider (PRD 2.20).
    const customModel = model !== undefined && model !== '' ? model : 'custom-model';
    config.providers['custom'] = {
      type: 'openai-compatible',
      baseURL,
      apiKey: apiKey !== undefined && apiKey !== '' ? apiKey : 'unused',
      models: [customModel],
    };
    config.defaultProvider = 'custom';
    config.defaultModel = customModel;
    for (const role of Object.values(config.roles)) {
      role.primary = `custom/${customModel}`;
    }
    return;
  }

  if (apiKey !== undefined && apiKey !== '' && config.providers[config.defaultProvider] !== undefined) {
    config.providers[config.defaultProvider] = { ...config.providers[config.defaultProvider]!, apiKey };
  }

  if (model !== undefined && model !== '') {
    config.defaultModel = model;
    const role = config.roles['manager'];
    if (role !== undefined) role.primary = `${config.defaultProvider}/${model}`;
  }
}

/** Redacted copy safe to send to the GUI. */
export function redactConfig(config: TagentConfig): TagentConfig {
  const copy = structuredClone(config);
  for (const provider of Object.values(copy.providers) as ProviderConfig[]) {
    if (provider.apiKey.length > 0) provider.apiKey = '********';
  }
  return copy;
}
