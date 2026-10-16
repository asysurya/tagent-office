/**
 * Path: packages/shared/test/logger.test.ts
 * Purpose: Unit tests for the structured logger: level filtering, child
 *          bindings, sinks, ring buffer capacity.
 * Dependencies: src/logger
 */
import { describe, expect, test } from 'bun:test';
import { collectingSink, createLogger, ringBufferSink } from '../src/logger';

describe('logger', () => {
  test('writes records as structured objects to the sink', () => {
    const sink = collectingSink();
    const logger = createLogger({ level: 'debug', sink });
    logger.info('hello', { workerId: 'FE-01' });
    const records = sink.records();
    expect(records.length).toBe(1);
    const record = records[0]!;
    expect(record.level).toBe('info');
    expect(record.msg).toBe('hello');
    expect(record.workerId).toBe('FE-01');
    expect(typeof record.ts).toBe('number');
  });

  test('filters below the configured level', () => {
    const sink = collectingSink();
    const logger = createLogger({ level: 'warn', sink });
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('shown');
    logger.error('shown');
    expect(sink.records().length).toBe(2);
    expect(sink.records().map((r) => r.level)).toEqual(['warn', 'error']);
  });

  test('child loggers merge bindings', () => {
    const sink = collectingSink();
    const root = createLogger({ level: 'info', sink, bindings: { mod: 'daemon' } });
    const child = root.child({ workerId: 'FE-01' });
    child.info('working');
    const record = sink.records()[0]!;
    expect(record.mod).toBe('daemon');
    expect(record.workerId).toBe('FE-01');
  });

  test('child logger level follows the root level', () => {
    const sink = collectingSink();
    const root = createLogger({ level: 'error', sink });
    const child = root.child({ mod: 'child' });
    child.info('should be filtered');
    expect(sink.records().length).toBe(0);
  });

  test('field collisions resolve to the call-site field', () => {
    const sink = collectingSink();
    const logger = createLogger({ level: 'info', sink, bindings: { workerId: 'root' } });
    logger.info('override', { workerId: 'caller' });
    expect(sink.records()[0]!.workerId).toBe('caller');
  });

  test('ring buffer keeps only the last N records', () => {
    const sink = ringBufferSink(3);
    const logger = createLogger({ level: 'info', sink });
    for (let i = 0; i < 5; i++) logger.info(`line-${i}`);
    expect(sink.entries().length).toBe(3);
    expect(sink.entries().map((r) => r.msg)).toEqual(['line-2', 'line-3', 'line-4']);
  });
});
