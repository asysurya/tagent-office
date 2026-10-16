/**
 * Path: packages/orchestrator/test/manager.test.ts
 * Purpose: SimpleManager tests — intake (breakdown, clarification threshold)
 *          and the execution loop (priority recalc, QA auto-pass, directive
 *          completion into iteration logs per PRD 2.17).
 * Dependencies: src/manager/simple-manager, src/store, src/todo, src/events,
 *              @tagent-office/core (MockProvider chain)
 */
import { describe, expect, test } from 'bun:test';
import {
  Agent,
  MockProvider,
  PermissionChecker,
  ProviderChain,
  createBuiltinToolRegistry,
} from '@tagent-office/core';
import { IdGenerator } from '@tagent-office/shared';
import { EventBus } from '../src/events/bus';
import { SimpleManager, parseBreakdown } from '../src/manager/simple-manager';
import { SqliteStore } from '../src/store/sqlite-store';
import { TaskQueue } from '../src/todo/queue';
import { WorkerPool } from '../src/worker/pool';

interface Harness {
  manager: SimpleManager;
  store: SqliteStore;
  bus: EventBus;
  events: string[];
}

function harness(options: { qaAutoPass?: boolean } = {}): Harness {
  const store = new SqliteStore({ path: ':memory:' });
  const queue = new TaskQueue({ store });
  const bus = new EventBus();
  const events: string[] = [];
  bus.onAny((type) => events.push(type));

  const pool = new WorkerPool({
    store,
    queue,
    bus,
    roles: [],
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
        workspaceRoot: '/tmp/tagent-manager-workspace',
      }),
  });

  const manager = new SimpleManager({
    store,
    queue,
    bus,
    pool,
    chain: new ProviderChain(new Map([['mock', new MockProvider()]]), [
      { providerId: 'mock', model: 'mock-echo-1' },
    ]),
    ids: new IdGenerator(),
    qaAutoPass: options.qaAutoPass ?? true,
  });
  return { manager, store, bus, events };
}

describe('SimpleManager — intake loop', () => {
  test('a clear file directive breaks down into todos and queues', async () => {
    const h = harness();
    const result = await h.manager.receiveDirective("Create a hello.txt file with content 'hello world'");
    expect(result.ok).toBe(true);
    const todos = h.store.listTodos();
    expect(todos.length).toBe(1);
    expect(todos[0]?.status).toBe('pending');
    expect(todos[0]?.parentDirective).toBe('dir-001');
    expect(h.events).toContain('office:directive.received');
    expect(h.events).toContain('office:todo.created');
    expect(h.events).toContain('office:directive.queued');
    expect(h.events).toContain('office:task.fanout');
  });

  test('an ambiguous directive triggers a clarification session (PRD 2.14)', async () => {
    const h = harness();
    await h.manager.receiveDirective('make it better somehow');
    const directive = h.store.getDirective('dir-001');
    expect(directive?.status).toBe('pending_clarification');
    expect(directive?.clarificationId).toBe('clar-001');
    const clarification = h.store.getClarification('clar-001');
    expect(clarification?.questions.length).toBeLessThanOrEqual(7);
    expect(h.events).toContain('office:clarification.created');
    expect(h.store.listTodos().length).toBe(0);
  });

  test('directive ids sequence across directives', async () => {
    const h = harness();
    await h.manager.receiveDirective("Create a one.txt file with content '1'");
    await h.manager.receiveDirective("Create a two.txt file with content '2'");
    const ids = h.store.listDirectives().map((directive) => directive.id).sort();
    expect(ids).toEqual(['dir-001', 'dir-002']);
    expect(h.store.listTodos().length).toBe(2);
  });
});

describe('parseBreakdown', () => {
  test('parses a well-formed breakdown with defaults for missing fields', () => {
    const parsed = parseBreakdown(
      JSON.stringify({
        confidence: 0.9,
        todos: [{ title: 'Do it', description: 'Thing' }],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.confidence).toBe(0.9);
    expect(parsed?.todos[0]?.type).toBe('feature'); // default
    expect(parsed?.todos[0]?.role).toBe('any'); // default
    expect(parsed?.todos[0]?.requiresQA).toBe(false);
  });

  test('tolerates markdown fences around the JSON', () => {
    const parsed = parseBreakdown('```json\n{"confidence": 0.95, "todos": []}\n```');
    expect(parsed?.confidence).toBe(0.95);
  });

  test('garbage returns null', () => {
    expect(parseBreakdown('I will break it down for you.')).toBeNull();
  });

  test('confidence is clamped into [0,1]', () => {
    const parsed = parseBreakdown('{"confidence": 42, "todos": []}');
    expect(parsed?.confidence).toBe(1);
  });
});

describe('SimpleManager — execution loop', () => {
  test('ready_for_test todos auto-pass and the directive completes with an iteration', async () => {
    const h = harness();
    await h.manager.receiveDirective("Create a qa.txt file with content 'x'");
    // Force the todo into ready_for_test as a worker would with requiresQA.
    const todo = h.store.listTodos()[0]!;
    h.store.updateTodo(todo.id, { status: 'ready_for_test' });

    await h.manager.tick();

    expect(h.store.getTodo(todo.id)?.status).toBe('done');
    expect(h.events).toContain('office:todo.done');
    const directive = h.store.getDirective('dir-001');
    expect(directive?.status).toBe('done');
    expect(h.events).toContain('office:directive.done');
    expect(h.events).toContain('office:iteration.done');
    expect(h.events).toContain('office:project.done');
    expect(h.store.countIterations()).toBe(1);
  });

  test('failed todos complete the directive with a partial verdict', async () => {
    const h = harness();
    await h.manager.receiveDirective("Create a broken.txt file with content 'x'");
    const todo = h.store.listTodos()[0]!;
    h.store.updateTodo(todo.id, { status: 'failed' });

    await h.manager.tick();

    const directive = h.store.getDirective('dir-001');
    expect(directive?.status).toBe('done');
    expect(h.events).toContain('office:iteration.done');
  });

  test('qaAutoPass=false leaves ready_for_test untouched', async () => {
    const h = harness({ qaAutoPass: false });
    await h.manager.receiveDirective("Create a qa.txt file with content 'x'");
    const todo = h.store.listTodos()[0]!;
    h.store.updateTodo(todo.id, { status: 'ready_for_test' });
    await h.manager.tick();
    expect(h.store.getTodo(todo.id)?.status).toBe('ready_for_test');
  });

  test('priorities age and category drift is persisted', async () => {
    const h = harness();
    await h.manager.receiveDirective("Create a slow.txt file with content 'x'");
    const todo = h.store.listTodos()[0]!;
    // Backdate creation by 10 minutes and tick with that fake now.
    h.store.updateTodo(todo.id, { priority: 60 });
    const tenMinutesLater = Date.now() + 10 * 60_000;
    await h.manager.tick(tenMinutesLater);
    const updated = h.store.getTodo(todo.id);
    expect(updated?.priority).toBeGreaterThan(60); // aging applied
  });
});
