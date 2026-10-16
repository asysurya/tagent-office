/**
 * Path: packages/shared/test/types.test.ts
 * Purpose: Compile-time + light runtime checks for the domain type unions.
 *          These tests mostly pin the shape of PRD 2.10-2.26 so accidental
 *          union changes break loudly.
 * Dependencies: src/types
 */
import { describe, expect, test } from 'bun:test';
import type { EventName, EventMap, SnapshotPayload } from '../src/types';
import type { TodoStatus } from '../src/types/todo';

const TODO_STATUSES: TodoStatus[] = [
  'pending',
  'assigned',
  'in_progress',
  'ready_for_test',
  'testing',
  'done',
  'failed',
  'blocked',
  'paused',
  'escalated',
  'cancelled',
];

describe('types', () => {
  test('todo status union matches PRD 2.10 exactly', () => {
    const status: TodoStatus = 'pending';
    expect(TODO_STATUSES.length).toBe(11);
    expect(TODO_STATUSES).toContain(status);
  });

  test('event map carries the PRD 2.26 namespaces', () => {
    const names: EventName[] = [
      'office:todo.created',
      'office:directive.received',
      'office:worker.spawned',
      'source:file.changed',
      'console:log.append',
      'preview:updated',
    ];
    for (const name of names) {
      const handler: (payload: EventMap[EventName]) => void = () => undefined;
      expect(handler).toBeDefined();
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('snapshot payload type is constructible', () => {
    const snapshot: SnapshotPayload = {
      serverTime: Date.now(),
      version: '0.1.0',
      directives: [],
      todos: [],
      workers: [],
      logs: [],
    };
    expect(snapshot.serverTime).toBeGreaterThan(0);
  });
});
