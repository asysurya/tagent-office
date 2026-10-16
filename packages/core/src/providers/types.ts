/**
 * Path: packages/core/src/providers/types.ts
 * Purpose: Chat provider contracts. One protocol for every provider — the
 *          agent loop and manager never know which LLM they talk to.
 * Dependencies: @tagent-office/shared
 */
import { err, ok, ValidationError, type ProviderError, type Result } from '@tagent-office/shared';

/** Chat message as sent to the model. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A chat completion request. */
export interface ChatRequest {
  messages: ChatMessage[];
  /** Overrides the adapter default when set. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Token usage accounting. */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

/** A completed chat response. */
export interface ChatResponse {
  content: string;
  model: string;
  usage?: ChatUsage;
  finishReason?: string;
}

/** A provider adapter (openai-compatible, openai, mock, ...). */
export interface ProviderAdapter {
  readonly name: string;
  readonly defaultModel: string;
  chat(request: ChatRequest): Promise<Result<ChatResponse, ProviderError>>;
}

/** Parsed "provider/model" reference (PRD 2.20). */
export interface ModelRef {
  providerId: string;
  model: string;
}

/** Parse "provider/model" — the part after the FIRST slash is the model. */
export function parseModelRef(ref: string): Result<ModelRef, ValidationError> {
  const separator = ref.indexOf('/');
  if (separator <= 0 || separator === ref.length - 1) {
    return err(new ValidationError(`Invalid model reference "${ref}" — expected "provider/model"`));
  }
  return ok({ providerId: ref.slice(0, separator), model: ref.slice(separator + 1) });
}
