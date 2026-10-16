/**
 * Path: packages/orchestrator/test/store.test.ts
 * Purpose: SqliteStore tests — PRD 2.25 schema, positional args, todo CRUD,
 *          atomic claims, deps, events, directives, iterations,
 *          clarifications, workers, maxSeq seeding. Fresh :memory: DB per
 *          test (anti-pattern #6: isolated, order-independent).
 * Dependencies: src/store/sqlite-store
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { SqliteStore } from '../src/store/sqlite-store';
import type { Todo } from '@tagent-office/shared';

let store: SqliteStore;

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'T-001',
    title: 'Create hello.txt',
    description: 'Create hello.txt with the content hello world',
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
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  store = new SqliteStore({ path: ':memory:' });
});

describe('SqliteStore — todos', () => {
  test('inserts and fetches a full todo round-trip', () => {
    store.insertTodo(makeTodo({ deps: ['T-000'], blocks: ['T-002'], evidence: { summary: 'x' } }));
    const todo = store.getTodo('T-001');
    expect(todo).not.toBeNull();
    expect(todo?.title).toBe('Create hello.txt');
    expect(todo?.deps).toEqual(['T-000']);
    expect(todo?.blocks).toEqual(['T-002']);
    expect(todo?.evidence).toEqual({ summary: 'x' });
    expect(todo?.requiresQA).toBe(false);
  });

  test('requires throw NotFoundError for missing todos', () => {
    expect(() => store.requireTodo('T-999')).toThrow();
  });

  test('lists todos with status filter and priority order', () => {
    store.insertTodo(makeTodo({ id: 'T-001', priority: 60 }));
    store.insertTodo(makeTodo({ id: 'T-002', priority: 95 }));
    store.insertTodo(makeTodo({ id: 'T-003', priority: 80, status: 'done' }));
    const listed = store.listTodos({ status: ['pending'] });
    expect(listed.map((todo) => todo.id)).toEqual(['T-002', 'T-001']);
  });

  test('patches update fields and refresh updatedAt', () => {
    store.insertTodo(makeTodo());
    const updated = store.updateTodo('T-001', { status: 'in_progress', assignee: 'FE-01', filesChanged: ['hello.txt'] });
    expect(updated.status).toBe('in_progress');
    expect(updated.assignee).toBe('FE-01');
    expect(updated.filesChanged).toEqual(['hello.txt']);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(1_000);
  });

  test('claimNextTodo is atomic — only one winner', () => {
    store.insertTodo(makeTodo({ id: 'T-001', priority: 90 }));
    const first = store.claimNextTodo('FE-01', 'frontend');
    const second = store.claimNextTodo('BE-01', 'backend');
    expect(first?.assignee).toBe('FE-01');
    expect(first?.status).toBe('assigned');
    expect(second).toBeNull();
  });

  test('role filter: frontend todos are claimable by frontend workers only', () => {
    store.insertTodo(makeTodo({ id: 'T-001', role: 'backend' }));
    expect(store.claimNextTodo('FE-01', 'frontend')).toBeNull();
    expect(store.claimNextTodo('BE-01', 'backend')?.assignee).toBe('BE-01');
  });

  test('role any is claimable by everyone', () => {
    store.insertTodo(makeTodo({ id: 'T-001', role: 'any' }));
    expect(store.claimNextTodo('FE-01', 'frontend')?.id).toBe('T-001');
  });

  test('todos with unfinished deps are skipped until deps are done', () => {
    store.insertTodo(makeTodo({ id: 'T-001', priority: 30 }));
    store.insertTodo(makeTodo({ id: 'T-002', priority: 95, deps: ['T-001'] }));
    const claimed = store.claimNextTodo('FE-01', 'frontend');
    expect(claimed?.id).toBe('T-001'); // T-002 blocked despite higher priority
    store.updateTodo('T-001', { status: 'done' });
    store.insertTodo(makeTodo({ id: 'T-003', status: 'pending' }));
    const next = store.claimNextTodo('FE-02', 'frontend');
    expect(next?.id).toBe('T-002');
  });

  test('todo events accumulate as an audit trail', () => {
    store.insertTodo(makeTodo());
    store.appendTodoEvent('T-001', 'created', { by: 'manager' });
    store.appendTodoEvent('T-001', 'started', { by: 'FE-01' });
    const events = store.listTodoEvents('T-001');
    expect(events.length).toBe(2);
    expect(events[1]?.eventType).toBe('started');
    expect(events[1]?.payload).toEqual({ by: 'FE-01' });
  });
});

describe('SqliteStore — directives, iterations, clarifications', () => {
  test('directive round-trip and updates', () => {
    store.insertDirective({
      id: 'dir-001',
      text: 'Create a hello.txt file',
      priority: 60,
      status: 'queued',
      clarificationId: null,
      createdAt: 1_000,
      completedAt: null,
    });
    expect(store.getDirective('dir-001')?.status).toBe('queued');
    store.updateDirective('dir-001', { status: 'done', completedAt: 2_000 });
    const updated = store.getDirective('dir-001');
    expect(updated?.status).toBe('done');
    expect(updated?.completedAt).toBe(2_000);
    expect(store.listDirectives().length).toBe(1);
  });

  test('iterations count increments', () => {
    expect(store.countIterations()).toBe(0);
    store.insertIteration({
      id: 'iter-001',
      directiveId: 'dir-001',
      number: 1,
      startedAt: 1_000,
      endedAt: 2_000,
      verdict: 'passed',
      summary: 'ok',
      learnings: null,
      tokensInput: 10,
      tokensOutput: 20,
      cost: 0,
    });
    expect(store.countIterations()).toBe(1);
  });

  test('clarification round-trip and updates', () => {
    store.insertDirective({
      id: 'dir-001',
      text: 'make it better',
      priority: 60,
      status: 'pending_clarification',
      clarificationId: null,
      createdAt: 1_000,
      completedAt: null,
    });
    store.insertClarification({
      id: 'clar-001',
      directiveId: 'dir-001',
      status: 'pending',
      context: 'ambiguous',
      questions: [{ id: 'q1', type: 'free_text', question: 'What do you mean?' }],
      answers: null,
      note: null,
      resolution: null,
      createdAt: 1_000,
      answeredAt: null,
    });
    const loaded = store.getClarification('clar-001');
    expect(loaded?.questions.length).toBe(1);
    expect(loaded?.questions[0]?.question).toBe('What do you mean?');
    store.updateClarification('clar-001', { status: 'answered', answers: { q1: 'this' }, answeredAt: 2_000 });
    const answered = store.getClarification('clar-001');
    expect(answered?.status).toBe('answered');
    expect(answered?.answers).toEqual({ q1: 'this' });
    expect(store.listClarifications('pending').length).toBe(0);
  });
});

describe('SqliteStore — workers', () => {
  test('upsert, update, and heartbeat', () => {
    store.upsertWorker({
      id: 'FE-01',
      role: 'frontend',
      state: 'idle',
      currentTodoId: null,
      currentTodoState: null,
      startedAt: 1_000,
      lastHeartbeat: 1_000,
    });
    store.updateWorker('FE-01', { state: 'working', currentTodoId: 'T-001' });
    store.updateWorker('FE-01', { lastHeartbeat: 5_000 });
    const worker = store.getWorker('FE-01');
    expect(worker?.state).toBe('working');
    expect(worker?.currentTodoId).toBe('T-001');
    expect(worker?.lastHeartbeat).toBe(5_000);
    expect(store.listWorkers().length).toBe(1);
  });

  test('maxSeq seeds persistent worker ids (FE-01 -> FE-02 after restart)', () => {
    store.upsertWorker({
      id: 'FE-01',
      role: 'frontend',
      state: 'dead',
      currentTodoId: null,
      currentTodoState: null,
      startedAt: 1,
      lastHeartbeat: 1,
    });
    expect(store.maxSeq('FE')).toBe(1);
    expect(store.maxSeq('BE')).toBe(0);
  });
});

describe('SqliteStore — persistence', () => {
  test('file-backed databases survive reopen (WAL)', () => {
    const path = `/tmp/tagent-store-${Date.now()}.db`;
    const first = new SqliteStore({ path });
    first.insertTodo(makeTodo({ id: 'T-042' }));
    first.close();
    const second = new SqliteStore({ path });
    expect(second.getTodo('T-042')?.id).toBe('T-042');
    second.close();
  });
});
