/**
 * Path: packages/core/src/providers/openai-compat.ts
 * Purpose: THE generic OpenAI-compatible adapter. One adapter, configurable
 *          baseURL — works for OpenAI, Groq, Ollama, OpenRouter, LM Studio,
 *          vLLM, and anything else speaking /chat/completions
 *          (PRD 2.20: never write one adapter per provider).
 * Dependencies: @tagent-office/shared, ./types
 */
import { err, isErr, isRecord, ok, type Result } from '@tagent-office/shared';
import { ProviderError } from '@tagent-office/shared';
import type { ChatRequest, ChatResponse, ChatUsage, ProviderAdapter } from './types';

/** Adapter configuration. */
export interface OpenAICompatOptions {
  /** Registry id of this provider (e.g. "groq"). */
  name: string;
  /** e.g. https://api.groq.com/openai/v1 — no trailing /chat/completions. */
  baseURL: string;
  apiKey: string;
  defaultModel: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function isUsage(value: unknown): value is { prompt_tokens?: unknown; completion_tokens?: unknown } {
  return isRecord(value);
}

/** Generic OpenAI-compatible chat adapter. */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: string;
  readonly defaultModel: string;
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: OpenAICompatOptions) {
    this.name = options.name;
    this.defaultModel = options.defaultModel;
    this.baseURL = options.baseURL.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.headers = { ...(options.headers ?? {}) };
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** POST {baseURL}/chat/completions and map errors per PRD 2.15. */
  async chat(request: ChatRequest): Promise<Result<ChatResponse, ProviderError>> {
    const model = request.model ?? this.defaultModel;
    const url = `${this.baseURL}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
          ...this.headers,
        },
        body: JSON.stringify({
          model,
          messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: unknown) {
      // Network failure or timeout — retryable, fall down the chain.
      return err(
        new ProviderError(this.name, `request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`, {
          retryable: true,
          cause: error,
        }),
      );
    }

    if (response.status === 429 || response.status >= 500) {
      const body = await safeBody(response);
      return err(
        new ProviderError(this.name, `upstream ${response.status} from ${this.baseURL}: ${body}`, {
          status: response.status,
          retryable: true,
        }),
      );
    }

    if (!response.ok) {
      const body = await safeBody(response);
      return err(
        new ProviderError(this.name, `upstream ${response.status} from ${this.baseURL}: ${body}`, {
          status: response.status,
          retryable: false,
        }),
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error: unknown) {
      return err(
        new ProviderError(this.name, 'malformed JSON in response body', { retryable: true, cause: error }),
      );
    }

    const parsed = parseOpenAIChatResponse(payload);
    if (isErr(parsed)) {
      return err(new ProviderError(this.name, parsed.error.message, { retryable: true, cause: parsed.error }));
    }

    return ok({ ...parsed.value, model });
  }
}

/** Validate the openai-shaped payload. */
function parseOpenAIChatResponse(payload: unknown): Result<Omit<ChatResponse, 'model'>, Error> {
  if (!isRecord(payload)) return err(new Error('response is not an object'));
  if (payload['error'] !== undefined) {
    const message = isRecord(payload['error']) && typeof payload['error']['message'] === 'string'
      ? payload['error']['message']
      : JSON.stringify(payload['error']);
    return err(new Error(`provider error object: ${message}`));
  }
  const choices = payload['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    return err(new Error('response has no choices'));
  }
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first['message'])) return err(new Error('first choice has no message'));
  const content = first['message']['content'];
  if (typeof content !== 'string') return err(new Error('message.content is not a string'));
  const finishReason = first['finish_reason'];

  let usage: ChatUsage | undefined;
  if (isUsage(payload['usage'])) {
    const prompt = payload['usage']['prompt_tokens'];
    const completion = payload['usage']['completion_tokens'];
    usage = {
      inputTokens: typeof prompt === 'number' ? prompt : 0,
      outputTokens: typeof completion === 'number' ? completion : 0,
    };
  }

  return ok({
    content,
    usage,
    finishReason: typeof finishReason === 'string' ? finishReason : undefined,
  });
}

async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '(unreadable body)';
  }
}
