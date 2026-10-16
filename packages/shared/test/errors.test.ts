/**
 * Path: packages/shared/test/errors.test.ts
 * Purpose: Unit tests for the error hierarchy and ProviderError retryability.
 * Dependencies: src/errors
 */
import { describe, expect, test } from 'bun:test';
import {
  ConfigurationError,
  NotFoundError,
  PermissionError,
  ProviderError,
  TagentError,
  ValidationError,
} from '../src/errors';

describe('errors', () => {
  test('TagentError carries code and details', () => {
    const error = new TagentError('INTERNAL', 'something broke', { foo: 'bar' });
    expect(error.code).toBe('INTERNAL');
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.toLogFields()).toEqual({ code: 'INTERNAL', error: 'something broke', foo: 'bar' });
  });

  test('ValidationError maps to VALIDATION code', () => {
    expect(new ValidationError('bad input').code).toBe('VALIDATION');
  });

  test('NotFoundError includes entity and id', () => {
    const error = new NotFoundError('Todo', 'T-999');
    expect(error.message).toBe('Todo not found: T-999');
    expect(error.code).toBe('NOT_FOUND');
  });

  test('PermissionError maps to PERMISSION code', () => {
    expect(new PermissionError('jail violation').code).toBe('PERMISSION');
  });

  test('ConfigurationError maps to CONFIGURATION code', () => {
    expect(new ConfigurationError('missing provider').code).toBe('CONFIGURATION');
  });

  test('ProviderError defaults to non-retryable', () => {
    const error = new ProviderError('openai', 'bad request', { status: 400 });
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(400);
    expect(error.provider).toBe('openai');
  });

  test('ProviderError can be marked retryable', () => {
    const error = new ProviderError('groq', 'rate limited', { status: 429, retryable: true });
    expect(error.retryable).toBe(true);
  });

  test('all domain errors are TagentError instances', () => {
    expect(new ValidationError('x')).toBeInstanceOf(TagentError);
    expect(new ProviderError('p', 'x')).toBeInstanceOf(TagentError);
  });
});
