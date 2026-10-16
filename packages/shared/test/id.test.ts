/**
 * Path: packages/shared/test/id.test.ts
 * Purpose: Unit tests for the ID generator and parse/format helpers.
 * Dependencies: src/id
 */
import { describe, expect, test } from 'bun:test';
import { formatId, IdGenerator, parseId } from '../src/id';

describe('id', () => {
  test('formatId pads todo ids to 3 digits', () => {
    expect(formatId('T', 1)).toBe('T-001');
    expect(formatId('T', 42)).toBe('T-042');
    expect(formatId('T', 1000)).toBe('T-1000');
  });

  test('formatId pads directive and iteration ids to 3 digits', () => {
    expect(formatId('dir', 1)).toBe('dir-001');
    expect(formatId('iter', 12)).toBe('iter-012');
    expect(formatId('clar', 3)).toBe('clar-003');
  });

  test('formatId pads worker ids to 2 digits', () => {
    expect(formatId('FE', 1)).toBe('FE-01');
    expect(formatId('BE', 2)).toBe('BE-02');
    expect(formatId('QA', 10)).toBe('QA-10');
    expect(formatId('VIS', 11)).toBe('VIS-11');
  });

  test('parseId round-trips', () => {
    expect(parseId('T-001')).toEqual({ prefix: 'T', sequence: 1 });
    expect(parseId('FE-07')).toEqual({ prefix: 'FE', sequence: 7 });
    expect(parseId('iter-012')).toEqual({ prefix: 'iter', sequence: 12 });
  });

  test('parseId rejects malformed ids', () => {
    expect(parseId('nope')).toBeNull();
    expect(parseId('T-')).toBeNull();
    expect(parseId('T-abc')).toBeNull();
    expect(parseId('')).toBeNull();
  });

  test('generator increments per prefix independently', () => {
    const gen = new IdGenerator();
    expect(gen.next('T')).toBe('T-001');
    expect(gen.next('T')).toBe('T-002');
    expect(gen.next('FE')).toBe('FE-01');
    expect(gen.next('T')).toBe('T-003');
    expect(gen.next('FE')).toBe('FE-02');
  });

  test('generator seeds from a loader for resume-safety', () => {
    const gen = new IdGenerator((prefix) => (prefix === 'T' ? 5 : 0));
    expect(gen.next('T')).toBe('T-006');
    expect(gen.next('FE')).toBe('FE-01');
  });

  test('generator current reports the last sequence', () => {
    const gen = new IdGenerator();
    gen.next('T');
    gen.next('T');
    expect(gen.current('T')).toBe(2);
    expect(gen.current('BE')).toBe(0);
  });
});
