/**
 * Path: packages/daemon/test/server.test.ts
 * Purpose: HTTP API tests against a booted daemon (port 0, mock provider,
 * temp storage): health, config redaction + patching, directive intake
 * validation, todos listing, workers spawn/stop, error mapping, 404.
 * Dependencies: src/index (bootDaemon), socket.io-client
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '@tagent-office/shared';
import { bootDaemon, type DaemonHandle } from '../src/index';

const STORAGE = mkdtempSync(join(tmpdir(), 'tagent-daemon-'));
let handle: DaemonHandle;
let base: string;

beforeAll(async () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.storage = STORAGE;
  handle = await bootDaemon({ config, port: 0, logLevel: 'error' });
  base = `http://localhost:${handle.port}`;
}, 20_000);

afterAll(async () => {
  await handle.close();
  rmSync(STORAGE, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  test('reports ok with counters', async () => {
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; version: string; workers: { total: number } };
    expect(body['status']).toBe('ok');
    expect(body['version']).toBeDefined();
    expect(body['workers'].total).toBeGreaterThanOrEqual(2); // FE-01 + BE-01 at boot
  });
});

describe('GET/PUT /api/config', () => {
  test('api keys never leave the daemon', async () => {
    const response = await fetch(`${base}/api/config`);
    const body = (await response.json()) as { providers: Record<string, { apiKey: string }> };
    for (const provider of Object.values(body['providers'])) {
      expect(provider['apiKey']).toBe('********');
    }
  });

  test('PATCHing permissions and performance works', async () => {
    const response = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permissions: { tools: { bash: 'deny' } } }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { permissions: { tools: Record<string, string> } };
    expect(body['permissions']['tools']['bash']).toBe('deny');
  });

  test('invalid patches are rejected with 400', async () => {
    const response = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ performance: { maxWorkers: 999 } }),
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/directives', () => {
  test('rejects empty text with 400', async () => {
    const response = await fetch(`${base}/api/directives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });
    expect(response.status).toBe(400);
  });

  test('rejects oversized text with 400', async () => {
    const response = await fetch(`${base}/api/directives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(2_001) }),
    });
    expect(response.status).toBe(400);
  });

  test('accepts a directive with 202 and an id', async () => {
    const response = await fetch(`${base}/api/directives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'List the files in the workspace' }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { directive: { id: string } };
    expect(body['directive']['id']).toMatch(/^dir-\d+$/);
  });
});

describe('GET /api/todos', () => {
  test('lists todos with status filters and rejects unknown statuses', async () => {
    const okResponse = await fetch(`${base}/api/todos?status=pending,done`);
    expect(okResponse.status).toBe(200);
    const body = (await okResponse.json()) as { todos: unknown[] };
    expect(Array.isArray(body['todos'])).toBe(true);

    const badResponse = await fetch(`${base}/api/todos?status=nonsense`);
    expect(badResponse.status).toBe(400);
  });
});

describe('GET /api/workers + control', () => {
  test('lists booted workers (FE-01 and BE-01, never a hardcoded single worker)', async () => {
    const response = await fetch(`${base}/api/workers`);
    const body = (await response.json()) as { workers: Array<{ id: string; role: string }> };
    const ids = body['workers'].map((worker) => worker.id).sort();
    expect(ids).toContain('BE-01');
    expect(ids).toContain('FE-01');
  });

  test('spawns an extra frontend worker and stops it again', async () => {
    const spawn = await fetch(`${base}/api/workers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'frontend' }),
    });
    expect(spawn.status).toBe(201);
    const spawned = (await spawn.json()) as { spawned: string[] };
    expect(spawned['spawned'].length).toBe(1);
    expect(spawned['spawned'][0]).toBe('FE-02');

    const stop = await fetch(`${base}/api/workers/FE-02/stop`, { method: 'POST' });
    expect(stop.status).toBe(200);
  });

  test('stopping an unknown worker returns 404', async () => {
    const stop = await fetch(`${base}/api/workers/XX-99/stop`, { method: 'POST' });
    expect(stop.status).toBe(404);
  });
});

describe('unknown routes', () => {
  test('return a structured 404', async () => {
    const response = await fetch(`${base}/api/definitely-not-here`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body['error']['code']).toBe('NOT_FOUND');
  });
});

describe('bootDaemon honors TAGENT_OFFICE_* env (regression)', () => {
  test('env providers reach the standalone entry — no silent mock fallback', async () => {
    const envBackup = { ...process.env };
    const envStorage = mkdtempSync(join(tmpdir(), 'tagent-env-'));
    process.env['TAGENT_OFFICE_BASE_URL'] = 'http://127.0.0.1:9/v1';
    process.env['TAGENT_OFFICE_API_KEY'] = 'env-key';
    process.env['TAGENT_OFFICE_MODEL'] = 'env-model-x';
    process.env['TAGENT_OFFICE_STORAGE'] = envStorage;
    process.env['TAGENT_OFFICE_CONFIG'] = join(envStorage, 'no-file.json');

    try {
      const envHandle = await bootDaemon({ port: 0, logLevel: 'error' });
      const response = await fetch(`http://localhost:${envHandle.port}/api/config`);
      const config = (await response.json()) as {
        defaultProvider: string;
        defaultModel: string;
        providers: Record<string, { baseURL?: string }>;
      };
      expect(config['defaultProvider']).toBe('custom');
      expect(config['defaultModel']).toBe('env-model-x');
      expect(config['providers']['custom']?.baseURL).toBe('http://127.0.0.1:9/v1');
      await envHandle.close();
    } finally {
      for (const [key, value] of Object.entries(envBackup)) {
        process.env[key] = value;
      }
      rmSync(envStorage, { recursive: true, force: true });
    }
  }, 20_000);
});
