/**
 * Path: packages/core/test/fallback.test.ts
 * Purpose: ProviderChain tests — 3-layer fallback semantics (PRD 2.15):
 *          retryable errors fall through, fatal errors stop the chain,
 *          exhaustion returns the last error.
 * Dependencies: src/providers/fallback, ./types
 */
import { describe, expect, test } from 'bun:test';
import { isErr, isOk, ProviderError, type Result } from '@tagent-office/shared';
import { ProviderChain } from '../src/providers/fallback';
import type { ChatRequest, ChatResponse, ProviderAdapter } from '../src/providers/types';

/** Scripted adapter for chain tests. */
class ScriptedAdapter implements ProviderAdapter {
  readonly name: string;
  readonly defaultModel = 'm';
  calls = 0;

  constructor(
    name: string,
    private readonly behavior: () => Result<ChatResponse, ProviderError>,
  ) {
    this.name = name;
  }

  async chat(_request: ChatRequest): Promise<Result<ChatResponse, ProviderError>> {
    this.calls++;
    return this.behavior();
  }
}

function okAdapter(name: string): ScriptedAdapter {
  return new ScriptedAdapter(name, () => ({
    ok: true,
    value: { content: `from ${name}`, model: 'm' },
  }));
}

function retryableAdapter(name: string): ScriptedAdapter {
  return new ScriptedAdapter(name, () => ({
    ok: false,
    error: new ProviderError(name, `${name} timed out`, { retryable: true }),
  }));
}

function fatalAdapter(name: string): ScriptedAdapter {
  return new ScriptedAdapter(name, () => ({
    ok: false,
    error: new ProviderError(name, `${name} says unauthorized`, { status: 401, retryable: false }),
  }));
}

function chain(adapters: Map<string, ProviderAdapter>, steps: Array<{ providerId: string; model: string }>): ProviderChain {
  return new ProviderChain(adapters, steps);
}

describe('ProviderChain', () => {
  test('first step success returns immediately', async () => {
    const primary = okAdapter('primary');
    const backup = okAdapter('backup');
    const result = await chain(
      new Map([['primary', primary], ['backup', backup]]),
      [
        { providerId: 'primary', model: 'a' },
        { providerId: 'backup', model: 'b' },
      ],
    ).chat({ messages: [] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.content).toBe('from primary');
    expect(primary.calls).toBe(1);
    expect(backup.calls).toBe(0);
  });

  test('retryable errors fall through to the next step', async () => {
    const flaky = retryableAdapter('flaky');
    const backup = okAdapter('backup');
    const result = await chain(
      new Map([['flaky', flaky], ['backup', backup]]),
      [
        { providerId: 'flaky', model: 'a' },
        { providerId: 'backup', model: 'b' },
      ],
    ).chat({ messages: [] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.content).toBe('from backup');
    expect(flaky.calls).toBe(1);
    expect(backup.calls).toBe(1);
  });

  test('fatal errors stop the chain immediately', async () => {
    const dead = fatalAdapter('dead');
    const backup = okAdapter('backup');
    const result = await chain(
      new Map([['dead', dead], ['backup', backup]]),
      [
        { providerId: 'dead', model: 'a' },
        { providerId: 'backup', model: 'b' },
      ],
    ).chat({ messages: [] });
    expect(isErr(result)).toBe(true);
    expect(dead.calls).toBe(1);
    expect(backup.calls).toBe(0); // never reached
  });

  test('exhausted chains return the last retryable error', async () => {
    const one = retryableAdapter('one');
    const two = retryableAdapter('two');
    const result = await chain(
      new Map([['one', one], ['two', two]]),
      [
        { providerId: 'one', model: 'a' },
        { providerId: 'two', model: 'b' },
      ],
    ).chat({ messages: [] });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toContain('two');
    expect(one.calls).toBe(1);
    expect(two.calls).toBe(1);
  });

  test('the request carries the step model', async () => {
    const seen: Array<string | undefined> = [];
    const spy = new ScriptedAdapter('spy', () => ({
      ok: true,
      value: { content: 'ok', model: 'm' },
    }));
    const original = spy.chat.bind(spy);
    // Wrap to capture the model.
    (spy as unknown as { chat: (request: ChatRequest) => Promise<Result<ChatResponse, ProviderError>> }).chat =
      async (request: ChatRequest) => {
        seen.push(request.model);
        return original(request);
      };
    await chain(new Map([['spy', spy]]), [{ providerId: 'spy', model: 'exact-model' }]).chat({ messages: [] });
    expect(seen).toEqual(['exact-model']);
  });

  test('empty chains are a configuration error', async () => {
    const result = await chain(new Map(), []).chat({ messages: [] });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.name).toBe('ConfigurationError');
  });
});
