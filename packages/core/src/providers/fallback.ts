/**
 * Path: packages/core/src/providers/fallback.ts
 * Purpose: 3-layer fallback chains (PRD 2.15): multi-key (same provider,
 *          different key), downgrade (cheaper model), cross-provider. The
 *          chain tries entries in order on RETRYABLE errors only — user
 *          errors, tool errors, and permission denials never fall back.
 *          Trigger conditions: HTTP 429/5xx, timeout, malformed JSON,
 *          context length, capability mismatch.
 * Dependencies: @tagent-office/shared, ./types, ./registry
 */
import { err, isErr, ok, type Logger, type Result } from '@tagent-office/shared';
import { ConfigurationError } from '@tagent-office/shared';
import type { ProviderRegistry } from './registry';
import type { ChatRequest, ChatResponse, ProviderAdapter } from './types';
import { parseModelRef } from './types';

/** One step in a fallback chain. */
export interface ChainStep {
  providerId: string;
  model: string;
}

/** Callback fired whenever a step fails and the chain falls through. */
export type OnFallback = (step: ChainStep, error: unknown, nextStep: ChainStep | null) => void;

/** Ordered provider chain with retry semantics. */
export class ProviderChain {
  constructor(
    private readonly adapters: Map<string, ProviderAdapter>,
    private readonly steps: ChainStep[],
    private readonly onFallback?: OnFallback,
  ) {}

  /** The ordered steps (for diagnostics). */
  plan(): ChainStep[] {
    return [...this.steps];
  }

  /**
   * Chat through the chain: first success wins. Fatal errors short-circuit.
   * When every step fails, the last error is returned.
   */
  async chat(request: ChatRequest): Promise<Result<ChatResponse, Error>> {
    if (this.steps.length === 0) {
      return err(new ConfigurationError('Provider chain is empty'));
    }
    let lastError: Error | null = null;

    for (let index = 0; index < this.steps.length; index++) {
      const step = this.steps[index]!;
      const adapter = this.adapters.get(step.providerId);
      if (adapter === undefined) {
        lastError = new ConfigurationError(`Provider "${step.providerId}" is not registered`);
        continue;
      }

      const result = await adapter.chat({ ...request, model: step.model });
      if (result.ok) return ok(result.value);

      const nextStep = this.steps[index + 1] ?? null;
      this.onFallback?.(step, result.error, nextStep);

      if (!result.error.retryable) {
        // Fatal provider errors (4xx, bad auth) never fall back (PRD 2.15).
        return err(result.error);
      }
      lastError = result.error;
    }

    return err(lastError ?? new ConfigurationError('Provider chain exhausted without an error'));
  }
}

/** Build a chain from "provider/model" refs resolved against the registry. */
export function buildChain(
  registry: ProviderRegistry,
  refs: string[],
  options: { onFallback?: OnFallback; logger?: Logger } = {},
): Result<ProviderChain, ConfigurationError> {
  const steps: ChainStep[] = [];
  const adapters = new Map<string, ProviderAdapter>();

  for (const ref of refs) {
    const parsed = parseModelRef(ref);
    if (isErr(parsed)) {
      return err(new ConfigurationError(`Invalid model ref "${ref}": ${parsed.error.message}`));
    }
    if (steps.some((step) => step.providerId === parsed.value.providerId && step.model === parsed.value.model)) {
      continue; // de-duplicated
    }
    const adapter = registry.get(parsed.value.providerId);
    if (isErr(adapter)) {
      return err(new ConfigurationError(`Model ref "${ref}" points at an unknown provider`));
    }
    adapters.set(parsed.value.providerId, adapter.value);
    steps.push({ providerId: parsed.value.providerId, model: parsed.value.model });
    options.logger?.debug('chain step added', { ref, providerId: parsed.value.providerId });
  }

  if (steps.length === 0) {
    return err(new ConfigurationError('No valid model refs supplied for the chain'));
  }
  return ok(new ProviderChain(adapters, steps, options.onFallback));
}
