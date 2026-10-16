/**
 * Path: packages/core/src/providers/registry.ts
 * Purpose: Provider registry — builds adapters from ProviderConfig entries
 *          (mock / openai / openai-compatible) and hands them out by id.
 *          One generic adapter covers every openai-compatible provider.
 * Dependencies: @tagent-office/shared, ./types, ./openai-compat, ./openai, ./mock
 */
import {
  ConfigurationError,
  err,
  NotFoundError,
  ok,
  type ProviderConfig,
  type Result,
} from '@tagent-office/shared';
import type { ProviderAdapter } from './types';
import { MockProvider } from './mock';
import { createOpenAIProvider } from './openai';
import { OpenAICompatibleAdapter } from './openai-compat';

/** Builds and holds provider adapters by id. */
export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  /** Register an already-built adapter. */
  register(id: string, adapter: ProviderAdapter): Result<null, ConfigurationError> {
    if (this.adapters.has(id)) {
      return err(new ConfigurationError(`Provider already registered: ${id}`));
    }
    this.adapters.set(id, adapter);
    return ok(null);
  }

  /** Build and register an adapter from a ProviderConfig entry. */
  registerFromConfig(id: string, config: ProviderConfig): Result<null, ConfigurationError> {
    switch (config.type) {
      case 'mock': {
        return this.register(id, new MockProvider());
      }
      case 'openai': {
        return this.register(id, createOpenAIProvider(id, config));
      }
      case 'openai-compatible': {
        if (config.baseURL === undefined || config.baseURL.length === 0) {
          return err(new ConfigurationError(`Provider "${id}" (${config.type}) needs a baseURL`));
        }
        const model = config.models[0];
        if (model === undefined || model.length === 0) {
          return err(new ConfigurationError(`Provider "${id}" defines no models`));
        }
        return this.register(
          id,
          new OpenAICompatibleAdapter({
            name: id,
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            defaultModel: model,
            headers: config.headers,
          }),
        );
      }
      case 'anthropic': {
        // Anthropic adapter arrives in a later phase; the type is reserved
        // in the config schema (PRD 2.20) so configs stay forward-compatible.
        return err(new ConfigurationError(`Provider type "anthropic" is not implemented in Phase 1`));
      }
      default: {
        return err(new ConfigurationError(`Unknown provider type: ${String(config.type)}`));
      }
    }
  }

  /** Fetch an adapter by id. */
  get(id: string): Result<ProviderAdapter, NotFoundError> {
    const adapter = this.adapters.get(id);
    if (adapter === undefined) return err(new NotFoundError('Provider', id));
    return ok(adapter);
  }

  /** All registered ids. */
  list(): string[] {
    return [...this.adapters.keys()];
  }
}

/** Build a registry from a providers config map. */
export function buildProviderRegistry(
  providers: Record<string, ProviderConfig>,
): Result<ProviderRegistry, ConfigurationError> {
  const registry = new ProviderRegistry();
  for (const [id, config] of Object.entries(providers)) {
    const result = registry.registerFromConfig(id, config);
    if (!result.ok) return err(result.error);
  }
  return ok(registry);
}
