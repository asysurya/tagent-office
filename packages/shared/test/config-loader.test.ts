/**
 * Path: packages/shared/test/config-loader.test.ts
 * Purpose: Unit tests for config loading: defaults, JSON file merge, env
 *          overrides (env wins), openai-compatible custom provider via
 *          TAGENT_OFFICE_BASE_URL, ${ENV} references, validation, redaction.
 * Dependencies: src/config-loader, src/errors
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, loadConfig, redactConfig } from '../src/config-loader';
import { ConfigurationError, ValidationError } from '../src/errors';

const TMP_DIR = join(import.meta.dir, 'tmp-config');
mkdirSync(TMP_DIR, { recursive: true });

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('config-loader defaults', () => {
  test('loads the mock default config with no file and no env', () => {
    const config = loadConfig({ env: {}, configPath: join(TMP_DIR, 'does-not-exist.json') });
    expect(config.port).toBe(4020);
    expect(config.defaultProvider).toBe('mock');
    expect(config.telemetry).toBe(false);
    expect(config.providers['mock']).toBeDefined();
    expect(config.roles['manager'].primary).toBe('mock/mock-echo-1');
  });
});

describe('config-loader file merge', () => {
  test('JSON file merges over defaults and env wins over the file', () => {
    const path = join(TMP_DIR, 'merge.json');
    writeFileSync(path, JSON.stringify({ port: 4100, defaultProvider: 'mock' }));
    const config = loadConfig({ configPath: path, env: { TAGENT_OFFICE_PORT: '4200' } });
    expect(config.port).toBe(4200); // env beats file
  });

  test('file can define an openai-compatible provider with ${ENV} api key', () => {
    const path = join(TMP_DIR, 'provider.json');
    writeFileSync(
      path,
      JSON.stringify({
        providers: {
          groq: {
            type: 'openai-compatible',
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: '${GROQ_TEST_KEY}',
            models: ['llama-3.3-70b-versatile'],
          },
        },
      }),
    );
    const config = loadConfig({
      configPath: path,
      env: { GROQ_TEST_KEY: 'gq_test_123' },
    });
    expect(config.providers['groq']?.apiKey).toBe('gq_test_123');
  });

  test('missing referenced env var is a ConfigurationError', () => {
    const path = join(TMP_DIR, 'missing-env.json');
    writeFileSync(
      path,
      JSON.stringify({ providers: { x: { type: 'openai-compatible', apiKey: '${NOPE_UNDEFINED}', models: ['m'] } } }),
    );
    expect(() => loadConfig({ configPath: path, env: {} })).toThrow(ConfigurationError);
  });
});

describe('config-loader env overrides', () => {
  test('TAGENT_OFFICE_BASE_URL registers a custom openai-compatible provider', () => {
    const config = loadConfig({
      env: {
        TAGENT_OFFICE_BASE_URL: 'https://api.groq.com/openai/v1',
        TAGENT_OFFICE_API_KEY: 'gq_live',
        TAGENT_OFFICE_MODEL: 'llama-3.3-70b-versatile',
      },
      configPath: join(TMP_DIR, 'none.json'),
    });
    expect(config.defaultProvider).toBe('custom');
    expect(config.defaultModel).toBe('llama-3.3-70b-versatile');
    expect(config.providers['custom']?.type).toBe('openai-compatible');
    expect(config.providers['custom']?.baseURL).toBe('https://api.groq.com/openai/v1');
    expect(config.roles['manager'].primary).toBe('custom/llama-3.3-70b-versatile');
  });

  test('TAGENT_OFFICE_PORT and MAX_WORKERS are applied', () => {
    const config = loadConfig({
      env: { TAGENT_OFFICE_PORT: '5050', TAGENT_OFFICE_MAX_WORKERS: '2' },
      configPath: join(TMP_DIR, 'none.json'),
    });
    expect(config.port).toBe(5050);
    expect(config.performance.maxWorkers).toBe(2);
  });

  test('invalid port from env throws ConfigurationError', () => {
    expect(() =>
      loadConfig({ env: { TAGENT_OFFICE_PORT: 'not-a-port' }, configPath: join(TMP_DIR, 'none.json') }),
    ).toThrow(ConfigurationError);
  });

  test('env beats file for port (PRD 2.21: env menang)', () => {
    const path = join(TMP_DIR, 'envwins.json');
    writeFileSync(path, JSON.stringify({ port: 4030 }));
    const config = loadConfig({ configPath: path, env: { TAGENT_OFFICE_PORT: '4040' } });
    expect(config.port).toBe(4040);
  });
});

describe('config validation', () => {
  test('unknown defaultProvider fails validation', () => {
    const path = join(TMP_DIR, 'bad-provider.json');
    writeFileSync(path, JSON.stringify({ defaultProvider: 'ghost' }));
    expect(() => loadConfig({ configPath: path, env: {} })).toThrow(ValidationError);
  });

  test('role referencing unknown provider fails validation', () => {
    const path = join(TMP_DIR, 'bad-role.json');
    writeFileSync(
      path,
      JSON.stringify({ roles: { manager: { primary: 'ghost/model-a', fallbacks: [] } } }),
    );
    expect(() => loadConfig({ configPath: path, env: {} })).toThrow(ValidationError);
  });

  test('role model ref without slash fails validation', () => {
    const path = join(TMP_DIR, 'bad-ref.json');
    writeFileSync(path, JSON.stringify({ roles: { manager: { primary: 'model-only', fallbacks: [] } } }));
    expect(() => loadConfig({ configPath: path, env: {} })).toThrow(ValidationError);
  });
});

describe('redactConfig', () => {
  test('api keys are replaced for the GUI', () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.providers['openai'] = { type: 'openai', apiKey: 'sk-secret', models: ['gpt-4o-mini'] };
    const redacted = redactConfig(config);
    expect(redacted.providers['openai']?.apiKey).toBe('********');
    expect(config.providers['openai']?.apiKey).toBe('sk-secret'); // original untouched
  });
});
