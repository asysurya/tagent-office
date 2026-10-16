/**
 * Path: packages/shared/test/result.test.ts
 * Purpose: Unit tests for the Result<T, E> type and helpers.
 * Dependencies: src/result
 */
import { describe, expect, test } from 'bun:test';
import type { Result } from '../src/result';
import { attempt, attemptAsync, err, isErr, isOk, ok, unwrapOr } from '../src/result';

describe('result', () => {
  test('ok() wraps a success value', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  test('err() wraps a failure value', () => {
    const result = err(new Error('boom'));
    expect(result.ok).toBe(false);
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  test('isOk narrows to the value branch', () => {
    const result: Result<number, Error> = ok(7);
    if (isOk(result)) expect(result.value).toBe(7);
    else throw new Error('unreachable');
  });

  test('isErr narrows to the error branch', () => {
    const result: Result<number, Error> = err(new Error('nope'));
    if (isErr(result)) expect(result.error.message).toBe('nope');
    else throw new Error('unreachable');
  });

  test('unwrapOr returns the value on success', () => {
    const result: Result<number, string> = ok(5);
    expect(unwrapOr(result, 0)).toBe(5);
  });

  test('unwrapOr returns the fallback on failure', () => {
    const result: Result<number, string> = err('bad');
    expect(unwrapOr(result, 0)).toBe(0);
  });

  test('attempt converts thrown errors to err()', () => {
    const result = attempt((): number => {
      throw new Error('thrown');
    });
    expect(isErr(result)).toBe(true);
  });

  test('attempt returns ok on success', () => {
    const result = attempt(() => 'fine');
    expect(isOk(result) ? result.value : '').toBe('fine');
  });

  test('attemptAsync converts rejected promises to err()', async () => {
    const result = await attemptAsync(Promise.reject(new Error('async boom')));
    expect(isErr(result)).toBe(true);
  });

  test('attemptAsync returns ok on resolved promises', async () => {
    const result = await attemptAsync(Promise.resolve('yes'));
    expect(isOk(result) ? result.value : '').toBe('yes');
  });
});
