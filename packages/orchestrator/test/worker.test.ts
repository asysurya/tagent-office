/**
 * Path: packages/orchestrator/test/worker.test.ts
 * Purpose: Worker integration tests — claim -> execute (real Agent with
 *          MockProvider + real tools on a temp workspace) -> report; retry
 *          on failure; requeue on stop (resume-safety, PRD 2.12).
 * Dependencies: src/worker/worker, src/store, src/todo, src/events,
 *              @tagent-office/core
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@tagent-office/core';
import { ProviderChain } from '@tagent-office/core';
import { MockProvider } from '@tagent-office/core';
import { PermissionChecker } from '@tagent-office/core';
import { createBuiltinToolRegistry } from '@tagent-office/core';
import type { Directive, Todo } from '@tagent-office/shared';
import { EventBus } from '../src/events/bus';
import { SqliteStore } from '../src/store/sqlite-store';
import { TaskQueue } from '../src/todo/queue';
import { Worker } from '../src/worker/worker';

const WORKSPACE = join(tmpdir(), `tagent-worker-${Date.now()}`);
let store: SqliteStore;
let queue: TaskQueue;
let bus: EventBus;

beforeAll(() => {
  mkdirSync(WORKSPACE, { recursive: true });
});

afterAll(() => {
  rmSync(WORKSPACE, { recursive: true, force: true });
});

function makeWorker(id = 'FE-01'): Worker {
  const tools = createBuiltinToolRegistry({
    checker: new PermissionChecker({ tools: {}, autoApproveAsk: true }),
  });
  const chain = new ProviderChain(new Map([['mock', new MockProvider()]]), [
    { providerId: 'mock', model: 'mock-echo-1' },
  ]);
  return new Worker({
    id,
    role: 'frontend',
    store,
    queue,
    bus,
    agent: new Agent({
      workerId: id,
      role: 'frontend',
      chain,
      tools,
      workspaceRoot: WORKSPACE,
    }),
    pollIntervalMs: 25,
    heartbeatIntervalMs: 50,
  });
}

function seedDirectiveTodo(directiveText: string, todo: Partial<Todo> = {}): Todo {
  const directive: Directive = {
    id: 'dir-001',
    text: directiveText,
    priority: 60,
    status: 'queued',
    clarificationId: null,
    createdAt: Date.now(),
    completedAt: null,
  };
  store.insertDirective(directive);
  const full: Todo = {
    id: 'T-001',
    title: 'Create hello.txt',
    description: 'Create hello.txt with the requested content.',
    type: 'feature',
    priority: 60,
    category: 'normal',
    status: 'pending',
    role: 'frontend',
    assignee: null,
    deps: [],
    blocks: [],
    createdBy: 'manager',
    createdIn: 'dir-001',
    parentDirective: 'dir-001',
    parentTodo: null,
    acceptance: ['File exists'],
    testScenarios: [],
    requiresQA: false,
    commitHash: null,
    filesChanged: [],
    evidence: null,
    attempts: 0,
    maxAttempts: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...todo,
  };
  store.insertTodo(full);
  return full;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
}

describe('Worker', () => {
  test('claims a todo, writes the file for real, and reports done', async () => {
    store = new SqliteStore({ path: ':memory:' });
    queue = new TaskQueue({ store });
    bus = new EventBus();
    seedDirectiveTodo("Create a hello.txt file with content 'hello world'");

    const events: string[] = [];
    bus.onAny((type) => events.push(type));

    const worker = makeWorker();
    const run = worker.start();
    const done = await waitFor(() => store.getTodo('T-001')?.status === 'done');
    worker.requestStop();
    await run;

    expect(done).toBe(true);
    const todo = store.requireTodo('T-001');
    expect(todo.filesChanged).toContain('hello.txt');
    expect(todo.evidence?.['summary']).toBeDefined();
    expect(readFileSync(join(WORKSPACE, 'hello.txt'), 'utf-8')).toBe('hello world');
    expect(events).toContain('office:worker.spawned');
    expect(events).toContain('office:todo.assigned');
    expect(events).toContain('office:agent.tool_call');
    expect(events).toContain('office:todo.done');
    expect(events).toContain('office:worker.idle');
  }, 10_000);

  test('requiresQA todos land in ready_for_test (QA pass is the Manager decision)', async () => {
    store = new SqliteStore({ path: ':memory:' });
    queue = new TaskQueue({ store });
    bus = new EventBus();
    seedDirectiveTodo("Create a qa.txt file with content 'needs review'", {
      id: 'T-002',
      requiresQA: true,
    });

    const worker = makeWorker();
    const run = worker.start();
    const ready = await waitFor(() => store.getTodo('T-002')?.status === 'ready_for_test');
    worker.requestStop();
    await run;
    expect(ready).toBe(true);
  }, 10_000);

  test('failing todos retry up to maxAttempts, then fail permanently', async () => {
    store = new SqliteStore({ path: ':memory:' });
    queue = new TaskQueue({ store });
    bus = new EventBus();
    // A todo the mock provider cannot satisfy: it finishes immediately with
    // a failure? No — instead we simulate repeated failure by giving the
    // todo a broken directive (agent finishes "no concrete file task") —
    // that path is a *success* for the agent. To test retries we sabotage
    // the workspace root to force write_file failures.
    seedDirectiveTodo("Create a blocked.txt file with content 'x'", {
      id: 'T-003',
      title: 'Impossible write',
    });

    const tools = createBuiltinToolRegistry({
      checker: new PermissionChecker({ tools: { write_file: 'deny' }, autoApproveAsk: false }),
    });
    const chain = new ProviderChain(new Map([['mock', new MockProvider()]]), [
      { providerId: 'mock', model: 'mock-echo-1' },
    ]);
    const worker = new Worker({
      id: 'FE-02',
      role: 'frontend',
      store,
      queue,
      bus,
      agent: new Agent({
        workerId: 'FE-02',
        role: 'frontend',
        chain,
        tools,
        workspaceRoot: WORKSPACE,
      }),
      pollIntervalMs: 10,
      heartbeatIntervalMs: 50,
    });

    const run = worker.start();
    const failed = await waitFor(() => store.getTodo('T-003')?.status === 'failed', 15_000);
    worker.requestStop();
    await run;

    expect(failed).toBe(true);
    expect(store.requireTodo('T-003').attempts).toBe(3); // maxAttempts respected
    const events = store.listTodoEvents('T-003');
    expect(events.some((event) => event.eventType === 'retry_scheduled')).toBe(true);
    expect(events.some((event) => event.eventType === 'failed_permanently')).toBe(true);
  }, 30_000);

  test('stop mid-idle is immediate and clean', async () => {
    store = new SqliteStore({ path: ':memory:' });
    queue = new TaskQueue({ store });
    bus = new EventBus();
    const worker = makeWorker('FE-03');
    const run = worker.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    worker.requestStop();
    await run;
    expect(store.getWorker('FE-03')?.state).toBe('dead');
  }, 10_000);
});
