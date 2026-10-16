/**
 * Path: packages/orchestrator/test/bus.test.ts
 * Purpose: Event bus tests — typed emit, unsubscribe, wildcard tap, and
 *          handler crash isolation (an emitter never dies to a bad listener).
 * Dependencies: src/events/bus
 */
import { describe, expect, test } from 'bun:test';
import { EventBus } from '../src/events/bus';

describe('EventBus', () => {
  test('delivers events to subscribers', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('office:worker.spawned', (payload) => {
      seen.push(`${payload.workerId}:${payload.role}`);
    });
    bus.emit('office:worker.spawned', { workerId: 'FE-01', role: 'frontend' });
    expect(seen).toEqual(['FE-01:frontend']);
  });

  test('unsubscribe works', () => {
    const bus = new EventBus();
    let count = 0;
    const off = bus.on('office:todo.updated', () => {
      count++;
    });
    bus.emit('office:todo.updated', { todo: null as never });
    off();
    bus.emit('office:todo.updated', { todo: null as never });
    expect(count).toBe(1);
  });

  test('wildcard tap sees everything with its type', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.onAny((type) => seen.push(type));
    bus.emit('office:todo.created', { todo: null as never });
    bus.emit('office:directive.received', { directive: null as never });
    expect(seen).toEqual(['office:todo.created', 'office:directive.received']);
  });

  test('crashing handlers do not break the emitter or other handlers', () => {
    const bus = new EventBus();
    let survived = false;
    bus.on('office:worker.dead', () => {
      throw new Error('listener bug');
    });
    bus.on('office:worker.dead', () => {
      survived = true;
    });
    expect(() => bus.emit('office:worker.dead', { workerId: 'FE-01', role: 'frontend', reason: 'test' })).not.toThrow();
    expect(survived).toBe(true);
  });

  test('listenerCount reflects subscriptions', () => {
    const bus = new EventBus();
    const off = bus.onAny(() => undefined);
    const off2 = bus.on('office:todo.done', () => undefined);
    expect(bus.listenerCount()).toBe(2);
    off();
    off2();
    expect(bus.listenerCount()).toBe(0);
  });
});
