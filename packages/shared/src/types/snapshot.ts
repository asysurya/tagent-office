/**
 * Path: packages/shared/src/types/snapshot.ts
 * Purpose: Full-state snapshot a client receives after connecting and asking
 *          for it via the 'request:snapshot' socket message (anti-pattern #8:
 *          the client initiates; the server never pushes before it is ready).
 * Dependencies: ./directive, ./todo, ./worker, ./log
 */
import type { Directive } from './directive';
import type { LogEntry } from './log';
import type { Todo } from './todo';
import type { WorkerInfo } from './worker';

/** Initial world-state sent to a freshly connected GUI. */
export interface SnapshotPayload {
  serverTime: number;
  version: string;
  directives: Directive[];
  todos: Todo[];
  workers: WorkerInfo[];
  /** Recent console entries (bounded ring buffer). */
  logs: LogEntry[];
}
