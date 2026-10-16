/**
 * Path: packages/core/test/providers.test.ts
 * Purpose: Provider tests. The openai-compatible adapter is verified against
 *          a REAL local HTTP server speaking the /chat/completions protocol —
 *          proving the HTTP path, auth header, error mapping, and response
 *          parsing with zero external API keys. Failure modes are triggered
 *          by message content (FORCE-429 / FORCE-GARBAGE).
 * Dependencies: src/providers/*
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { isErr, isOk } from '@tagent-office/shared';
import { MockProvider, MANAGER_BREAKDOWN_MARKER, WORKER_MARKER } from '../src/providers/mock';
import { createOpenAIProvider } from '../src/providers/openai';
import { OpenAICompatibleAdapter } from '../src/providers/openai-compat';
import { buildProviderRegistry, ProviderRegistry } from '../src/providers/registry';
import { parseModelRef } from '../src/providers/types';
import type { ChatMessage, ChatRequest } from '../src/providers/types';

// ---------------------------------------------------------------------------
// Fake openai-compatible server (real HTTP on localhost)
// ---------------------------------------------------------------------------
let server: ReturnType<typeof Bun.serve>;

function lastUserContent(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

function fakeCompletionResponse(messages: ChatMessage[]): string {
  const followUp = lastUserContent(messages).startsWith('OBSERVATION');
  return followUp
    ? JSON.stringify({ thought: 'work is done', action: { tool: 'finish', arguments: { summary: 'created the file' } } })
    : JSON.stringify({ thought: 'create the file', action: { tool: 'write_file', arguments: { path: 'hello.txt', content: 'hello world' } } });
}

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
        return new Response('not found', { status: 404 });
      }
      if (request.headers.get('authorization') !== 'Bearer test-key') {
        return Response.json({ error: { message: 'bad key' } }, { status: 401 });
      }
      const body = (await request.json()) as ChatRequest;
      const text = body.messages.map((message) => message.content).join('\n');
      if (text.includes('FORCE-429')) return new Response('rate limited', { status: 429 });
      if (text.includes('FORCE-GARBAGE')) {
        return new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return Response.json({
        choices: [{ message: { role: 'assistant', content: fakeCompletionResponse(body.messages) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });
    },
  });
});

afterAll(() => {
  server.stop(true);
});

function adapter(): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    name: 'fake-local',
    baseURL: `http://localhost:${server.port}/v1`,
    apiKey: 'test-key',
    defaultModel: 'fake-model-1',
  });
}

// ---------------------------------------------------------------------------
// MockProvider
// ---------------------------------------------------------------------------
describe('MockProvider', () => {
  const provider = new MockProvider();

  test('breaks down a file-creation directive with high confidence', async () => {
    const result = await provider.chat({
      messages: [
        { role: 'system', content: `system prompt with ${MANAGER_BREAKDOWN_MARKER} inside` },
        { role: 'user', content: "Create a hello.txt file with content 'hello world'" },
      ],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const parsed = JSON.parse(result.value.content) as { confidence: number; todos: unknown[] };
      expect(parsed.confidence).toBeGreaterThanOrEqual(0.9);
      expect(parsed.todos.length).toBe(1);
    }
  });

  test('ambiguous directives get low confidence (clarification path)', async () => {
    const result = await provider.chat({
      messages: [
        { role: 'system', content: MANAGER_BREAKDOWN_MARKER },
        { role: 'user', content: 'make it better somehow' },
      ],
    });
    if (isOk(result)) {
      const parsed = JSON.parse(result.value.content) as { confidence: number };
      expect(parsed.confidence).toBeLessThan(0.85);
    } else {
      throw new Error('expected ok');
    }
  });

  test('worker flow: write_file first, then finish after the observation', async () => {
    const system: ChatMessage = { role: 'system', content: WORKER_MARKER };
    const first = await provider.chat({
      messages: [system, { role: 'user', content: 'Create a hello.txt file with content "hello world"' }],
    });
    if (!isOk(first)) throw new Error('expected ok');
    const firstAction = JSON.parse(first.value.content) as { action: { tool: string } };
    expect(firstAction.action.tool).toBe('write_file');

    const second = await provider.chat({
      messages: [
        system,
        { role: 'user', content: 'Create a hello.txt file with content "hello world"' },
        { role: 'assistant', content: first.value.content },
        { role: 'user', content: 'OBSERVATION (step 1): Wrote 11 bytes to hello.txt' },
      ],
    });
    if (!isOk(second)) throw new Error('expected ok');
    const secondAction = JSON.parse(second.value.content) as { action: { tool: string } };
    expect(secondAction.action.tool).toBe('finish');
  });

  test('worker flow: list files runs bash then finishes', async () => {
    const system: ChatMessage = { role: 'system', content: WORKER_MARKER };
    const first = await provider.chat({
      messages: [system, { role: 'user', content: 'List the files in the workspace' }],
    });
    if (!isOk(first)) throw new Error('expected ok');
    expect((JSON.parse(first.value.content) as { action: { tool: string } }).action.tool).toBe('bash');
  });

  test('responses carry token usage', async () => {
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] });
    if (isOk(result)) expect(result.value.usage?.outputTokens).toBeGreaterThan(0);
    else throw new Error('expected ok');
  });
});

// ---------------------------------------------------------------------------
// parseModelRef
// ---------------------------------------------------------------------------
describe('parseModelRef', () => {
  test('parses "groq/llama-3.3-70b-versatile"', () => {
    const result = parseModelRef('groq/llama-3.3-70b-versatile');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.providerId).toBe('groq');
      expect(result.value.model).toBe('llama-3.3-70b-versatile');
    }
  });

  test('model names containing slashes survive (first slash splits)', () => {
    const result = parseModelRef('ollama/qwen2.5:7b/instruct');
    if (isOk(result)) expect(result.value.model).toBe('qwen2.5:7b/instruct');
    else throw new Error('expected ok');
  });

  test('malformed refs are rejected', () => {
    expect(isErr(parseModelRef('no-slash'))).toBe(true);
    expect(isErr(parseModelRef('/leading'))).toBe(true);
    expect(isErr(parseModelRef('trailing/'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OpenAICompatibleAdapter over real local HTTP
// ---------------------------------------------------------------------------
describe('OpenAICompatibleAdapter (local HTTP server)', () => {
  test('happy path: auth header, JSON action content, usage mapped', async () => {
    const result = await adapter().chat({
      messages: [
        { role: 'system', content: `${WORKER_MARKER} you are a worker` },
        { role: 'user', content: 'Create a hello.txt file with content "hello world"' },
      ],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.usage?.inputTokens).toBe(10);
      expect(result.value.usage?.outputTokens).toBe(20);
      const action = JSON.parse(result.value.content) as { action: { tool: string } };
      expect(action.action.tool).toBe('write_file');
    }
  });

  test('HTTP 429 maps to a retryable ProviderError', async () => {
    const result = await adapter().chat({
      messages: [{ role: 'user', content: 'FORCE-429 please' }],
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('429');
      expect((result.error as { retryable: boolean }).retryable).toBe(true);
    }
  });

  test('unreachable server maps to a retryable network error', async () => {
    const dead = new OpenAICompatibleAdapter({
      name: 'dead',
      baseURL: 'http://localhost:9/v1',
      apiKey: 'x',
      defaultModel: 'm',
      timeoutMs: 500,
    });
    const result = await dead.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect((result.error as { retryable: boolean }).retryable).toBe(true);
    }
  });

  test('bad credentials map to a fatal ProviderError', async () => {
    const unauthorized = new OpenAICompatibleAdapter({
      name: 'fake-local',
      baseURL: `http://localhost:${server.port}/v1`,
      apiKey: 'wrong-key',
      defaultModel: 'm',
    });
    const result = await unauthorized.chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect((result.error as { status?: number }).status).toBe(401);
      expect((result.error as { retryable: boolean }).retryable).toBe(false);
    }
  });

  test('non-JSON success bodies map to a retryable malformed error', async () => {
    const result = await adapter().chat({
      messages: [{ role: 'user', content: 'FORCE-GARBAGE please' }],
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect((result.error as { retryable: boolean }).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe('ProviderRegistry', () => {
  test('builds adapters for mock, openai, and openai-compatible configs', () => {
    const built = buildProviderRegistry({
      mock: { type: 'mock', apiKey: 'unused', models: ['mock-echo-1'] },
      openai: { type: 'openai', apiKey: 'sk-x', models: ['gpt-4o-mini'] },
      groq: { type: 'openai-compatible', baseURL: 'https://api.groq.com/openai/v1', apiKey: 'gq', models: ['llama-3.3-70b-versatile'] },
      ollama: { type: 'openai-compatible', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama', models: ['qwen2.5-coder:7b'] },
    });
    expect(isOk(built)).toBe(true);
    if (isOk(built)) expect(built.value.list().sort()).toEqual(['groq', 'mock', 'ollama', 'openai']);
  });

  test('openai-compatible without baseURL is rejected', () => {
    const built = buildProviderRegistry({ broken: { type: 'openai-compatible', apiKey: 'k', models: ['m'] } });
    expect(isErr(built)).toBe(true);
  });

  test('duplicate provider ids are rejected', () => {
    const registry = new ProviderRegistry();
    expect(isOk(registry.register('mock', new MockProvider()))).toBe(true);
    expect(isErr(registry.register('mock', new MockProvider()))).toBe(true);
  });

  test('createOpenAIProvider builds the native factory', () => {
    const openaiAdapter = createOpenAIProvider('openai', {
      type: 'openai',
      apiKey: 'sk-x',
      models: ['gpt-4o-mini'],
    });
    expect(openaiAdapter.name).toBe('openai');
    expect(openaiAdapter.defaultModel).toBe('gpt-4o-mini');
  });
});
