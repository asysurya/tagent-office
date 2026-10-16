/**
 * Path: packages/orchestrator/src/events/bus.ts
 * Purpose: Typed in-process event bus (office:* / source:* / console:* /
 *          preview:* namespaces, PRD 2.26). Handlers never crash the
 *          emitter; a wildcard tap powers the console + socket bridge.
 * Dependencies: @tagent-office/shared
 */
import type { EventMap, EventName, EventHandler, Logger } from '@tagent-office/shared';

/** Wildcard listener receiving every event. */
export type AnyHandler = (type: EventName, payload: unknown) => void;

/** Typed pub/sub. */
export class EventBus {
  private readonly handlers = new Map<EventName, Set<(payload: unknown) => void>>();
  private readonly anyHandlers = new Set<AnyHandler>();

  constructor(private readonly logger?: Logger) {}

  /** Subscribe to one event; returns an unsubscribe function. */
  on<K extends EventName>(type: K, handler: EventHandler<K>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    const wrapped = handler as (payload: unknown) => void;
    set.add(wrapped);
    this.handlers.set(type, set);
    return () => {
      set.delete(wrapped);
    };
  }

  /** Subscribe to every event (console tap, socket bridge). */
  onAny(handler: AnyHandler): () => void {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  /** Emit an event to all subscribers. */
  emit<K extends EventName>(type: K, payload: EventMap[K]): void {
    for (const handler of this.handlers.get(type) ?? []) {
      try {
        handler(payload);
      } catch (error: unknown) {
        this.logger?.error('event handler crashed', {
          event: type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const handler of this.anyHandlers) {
      try {
        handler(type, payload);
      } catch (error: unknown) {
        this.logger?.error('wildcard handler crashed', {
          event: type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Number of listeners (diagnostics + tests). */
  listenerCount(): number {
    let count = this.anyHandlers.size;
    for (const set of this.handlers.values()) count += set.size;
    return count;
  }
}
