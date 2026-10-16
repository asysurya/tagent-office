/**
 * Path: packages/core/src/providers/openai.ts
 * Purpose: OpenAI native factory — a thin configuration wrapper around the
 *          single generic openai-compatible adapter (PRD 2.20: one adapter,
 *          never one adapter per provider).
 * Dependencies: @tagent-office/shared, ./openai-compat
 */
import type { ProviderConfig } from '@tagent-office/shared';
import { ConfigurationError } from '@tagent-office/shared';
import { OpenAICompatibleAdapter } from './openai-compat';

/** OpenAI's official API root. */
export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

/**
 * Build the OpenAI native adapter from a ProviderConfig.
 * Uses the same OpenAICompatibleAdapter — OpenAI's API IS openai-compatible.
 */
export function createOpenAIProvider(providerId: string, config: ProviderConfig): OpenAICompatibleAdapter {
  if (config.type !== 'openai') {
    throw new ConfigurationError(`Provider "${providerId}" is not type "openai" (got "${config.type}")`);
  }
  const model = config.models[0];
  if (model === undefined || model.length === 0) {
    throw new ConfigurationError(`Provider "${providerId}" defines no models`);
  }
  return new OpenAICompatibleAdapter({
    name: providerId,
    baseURL: config.baseURL ?? OPENAI_API_BASE_URL,
    apiKey: config.apiKey,
    defaultModel: model,
    headers: config.headers,
  });
}
