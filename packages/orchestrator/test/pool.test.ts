/**
 * Path: packages/orchestrator/test/pool.test.ts
 * Purpose: WorkerPool tests — spawns N workers across roles (anti-pattern
 *          #4: never a hardcoded single worker), enforces the cap, requeues
 *          stale todos on boot, and restarts workers after missed
 *          heartbeats (PRD 2.12).
 * Dependencies: src/worker/pool, src/store, src/todo, src/events, core
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, MockProvider, PermissionChecker, ProviderChain, createBuiltinToolRegistry } from '@tagent-office/core';
import type { Todo } from '@tagent-office/shared';
import { EventBus } from '../src/events/bus';
import { SqliteStore } from '../src/store/sqlite-store';
import { TaskQueue } from '../src/todo/queue';
import { WorkerPool } from '../src/worker/pool';

const WORKSPACE = join(tmpdir(), `tagent-pool-${Date.now()}`);

beforeAll(() => {
  mkdirSync(WORKSPACE, { recursive: true });
});

afterAll(() => {
  rmSync(WORKSPACE, { recursive: true, force: true });
});

function makePool(roles: Array<'frontend' | 'backend'>, maxWorkers: number, heartbeatTimeoutMs = 15_000): {
  pool: WorkerPool;
  store: SqliteStore;
} {
  const store = new SqliteStore({ path: ':memory:' });
  const queue = new TaskQueue({ store });
  const bus = new EventBus();
  const pool = new WorkerPool({
    store,
    queue,
    bus,
    roles,
    maxWorkers,
    heartbeatTimeoutMs,
    pollIntervalMs: 20,
    heartbeatIntervalMs: 50,
    agentFactory: ({ id, role }) =>
      new Agent({
        workerId: id,
        role,
        chain: new ProviderChain(new Map([['mock', new MockProvider()]]), [
          { providerId: 'mock', model: 'mock-echo-1' },
        ]),
        tools: createBuiltinToolRegistry({
          checker: new PermissionChecker({ tools: {}, autoApproveAsk: true }),
        }),
        workspaceRoot: WORKSPACE,
      }),
  });
  return { pool, store };
}

function todo(id: string, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    title: `Task ${id}`,
    description: 'Do the thing',
    type: 'feature',
    priority: 60,
    category: 'normal',
    status: 'pending',
    role: 'any',
    assignee: null,
    deps: [],
    blocks: [],
    createdBy: 'manager',
    createdIn: 'dir-001',
    parentDirective: 'dir-001',
    parentTodo: null,
    acceptance: [],
    testScenarios: [],
    requiresQA: false,
    commitHash: null,
    filesChanged: [],
    evidence: null,
    attempts: 0,
    maxAttempts: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('WorkerPool', () => {
  test('spawns one worker per role (2 workers: FE-01 + BE-01)', async () => {
    const { pool, store } = makePool(['frontend', 'backend'], 4);
    await pool.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const workers = store.listWorkers();
    expect(workers.length).toBe(2);
    expect(workers.map((worker) => worker.id).sort()).toEqual(['BE-01', 'FE-01']);
    expect(workers.every((worker) => worker.state === 'idle')).toBe(true);
    await pool.stopAll();
  }, 10_000);

  test('respects the maxWorkers cap', async () => {
    const { pool } = makePool(['frontend', 'backend'], 1);
    await pool.start();
    expect(pool.liveCount()).toBe(1);
    const refused = pool.spawn('qa');
    expect(refused).toBeNull();
    await pool.stopAll();
  }, 10_000);

  test('boot requeues stale assigned todos (resume-safe)', async () => {
    // No roles spawned: nothing must re-claim the requeued todo before we assert.
    const { pool, store } = makePool([], 4);
    store.insertTodo(todo('T-001', { status: 'assigned', assignee: 'FE-01' }));
    await pool.start();
    expect(store.getTodo('T-001')?.status).toBe('pending');
    expect(store.getTodo('T-001')?.assignee).toBeNull();
    await pool.stopAll();
  }, 10_000);

  test('watchdog restarts a worker whose heartbeat went stale', async () => {
    const { pool, store } = makePool(['frontend'], 4, 100);
    await pool.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const firstHeartbeat = store.getWorker('FE-01')?.lastHeartbeat ?? 0;

    // Simulate a hung worker: backdate the heartbeat far past the timeout.
    store.updateWorker('FE-01', { lastHeartbeat: firstHeartbeat - 10_000 });
    pool.checkHealth();

    await new Promise((resolve) => setTimeout(resolve, 150));
    const revived = store.getWorker('FE-01');
    expect(revived?.state).not.toBe('dead');
    expect(revived?.lastHeartbeat).toBeGreaterThan(firstHeartbeat);
    await pool.stopAll();
  }, 15_000);

  test('stopAll leaves every worker dead', async () => {
    const { pool, store } = makePool(['frontend', 'backend'], 4);
    await pool.start();
    await pool.stopAll();
    const workers = store.listWorkers();
    expect(workers.every((worker) => worker.state === 'dead')).toBe(true);
    expect(pool.liveCount()).toBe(0);
  }, 10_000);

  test('daemon restarts reuse persistent worker ids instead of stacking ghosts', async () => {
    const { pool, store } = makePool(['frontend'], 4);
    await pool.start();
    await pool.stopAll();
    expect(store.listWorkers().length).toBe(1); // FE-01, dead

    // A new pool over the SAME store (process restart) must reuse FE-01.
    const queue = new TaskQueue({ store });
    const bus = new EventBus();
    const restarted = new WorkerPool({
      store,
      queue,
      bus,
      roles: ['frontend'],
      maxWorkers: 4,
      agentFactory: ({ id, role }) =>
        new Agent({
          workerId: id,
          role,
          chain: new ProviderChain(new Map([['mock', new MockProvider()]]), [
            { providerId: 'mock', model: 'mock-echo-1' },
          ]),
          tools: createBuiltinToolRegistry({
            checker: new PermissionChecker({ tools: {}, autoApproveAsk: true }),
          }),
          workspaceRoot: WORKSPACE,
        }),
    });
    await restarted.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const workers = store.listWorkers();
    expect(workers.length).toBe(1); // no ghost rows
    expect(workers[0]?.id).toBe('FE-01'); // persistent id
    expect(workers[0]?.state).toBe('idle'); // alive again
    await restarted.stopAll();
  }, 15_000);
});
