/**
 * Path: packages/daemon/test/e2e.mock.test.ts
 * Purpose: THE Phase 1 end-to-end proof (verification #6): boot the daemon
 *          with the MockProvider, POST the hello-world directive, and verify
 *          (1) the manager breaks it into a todo, (2) a worker claims and
 *          executes it, (3) write_file REALLY wrote storage/workspaces/demo/
 *          hello.txt to disk, (4) the todo reaches 'done', (5) console
 *          events stream in real time over socket.io, (6) the directive
 *          completes with an iteration log (PRD 2.17), (7) the snapshot
 *          handshake works (anti-pattern #8).
 * Dependencies: src/index (bootDaemon), socket.io-client
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, type Directive, type Todo } from '@tagent-office/shared';
import { io as createClient } from 'socket.io-client';
import { bootDaemon, type DaemonHandle } from '../src/index';

const STORAGE = mkdtempSync(join(tmpdir(), 'tagent-e2e-'));
const WORKSPACE_DIR = join(STORAGE, 'workspaces', 'demo');
let handle: DaemonHandle;
let base = '';

beforeAll(async () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.storage = STORAGE;
  config.workspace = 'demo';
  handle = await bootDaemon({ config, port: 0, logLevel: 'error' });
  base = `http://localhost:${handle.port}`;
}, 20_000);

afterAll(async () => {
  await handle.close();
  rmSync(STORAGE, { recursive: true, force: true });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`);
  return (await response.json()) as T;
}

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() >= deadline) return null;
    await sleep(100);
  }
}

describe('end-to-end with MockProvider (verification #6)', () => {
  test('directive -> breakdown -> worker -> real file -> done -> realtime stream', async () => {
    // 1) Connect the realtime console FIRST so we catch events live.
    const client = createClient(base, { path: '/socket.io' });
    const seenEvents: string[] = [];
    const seenConsole: string[] = [];
    client.on('office:todo.created', () => seenEvents.push('todo.created'));
    client.on('office:todo.assigned', () => seenEvents.push('todo.assigned'));
    client.on('office:agent.tool_call', () => seenEvents.push('tool_call'));
    client.on('office:todo.done', () => seenEvents.push('todo.done'));
    client.on('console:log.append', (payload: { entry: { message: string } }) => {
      seenConsole.push(payload['entry']['message']);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5_000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    // 2) POST the directive (the CEO's only job).
    const response = await fetch(`${base}/api/directives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: "Create a hello.txt file with content 'hello world'" }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { directive: { id: string } };
    expect(body['directive']['id']).toBe('dir-001');

    // 3) The todo reaches 'done' (pending -> assigned -> in_progress -> done).
    const todo = await waitFor(async () => {
      const list = await getJson<{ todos: Todo[] }>('/api/todos');
      const found = list['todos'].find((item) => item.parentDirective === 'dir-001');
      return found !== undefined && found.status === 'done' ? found : null;
    }, 20_000);
    expect(todo).not.toBeNull();
    expect(todo?.filesChanged).toContain('hello.txt');

    // 4) The file REALLY exists on disk with the exact content.
    const helloPath = join(WORKSPACE_DIR, 'hello.txt');
    expect(existsSync(helloPath)).toBe(true);
    expect(readFileSync(helloPath, 'utf-8')).toBe('hello world');

    // 5) Todo audit trail recorded the lifecycle.
    const detail = await getJson<{ todo: Todo; events: Array<{ eventType: string }> }>('/api/todos/T-001');
    expect(detail['todo']['status']).toBe('done');
    const eventTypes = detail['events'].map((event) => event['eventType']);
    expect(eventTypes).toContain('created');
    expect(eventTypes).toContain('started');
    expect(eventTypes).toContain('completed');

    // 6) Realtime events and console lines streamed during the run.
    const sawStream = await waitFor(
      async () => (seenEvents.includes('todo.done') && seenConsole.length > 0 ? true : null),
      5_000,
    );
    expect(sawStream).toBe(true);
    expect(seenEvents).toContain('todo.created');
    expect(seenEvents).toContain('tool_call');
    expect(seenConsole.some((line) => line.includes('hello.txt'))).toBe(true);

    // 7) The directive completed (iteration written, PRD 2.17).
    const directive = await waitFor(async () => {
      const found = await getJson<{ directive: Directive }>('/api/directives/dir-001');
      return found['directive'].status === 'done' ? found['directive'] : null;
    }, 10_000);
    expect(directive?.status).toBe('done');

    // 8) Snapshot handshake (anti-pattern #8: client-initiated).
    const snapshot = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('snapshot timeout')), 5_000);
      client.emit('request:snapshot');
      client.on('snapshot', (payload: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    expect(Array.isArray(snapshot['todos'])).toBe(true);
    expect(Array.isArray(snapshot['logs'])).toBe(true);
    expect(Array.isArray(snapshot['workers'])).toBe(true);

    client.disconnect();
  }, 45_000);
});
