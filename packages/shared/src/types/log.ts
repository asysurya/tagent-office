/**
 * Path: packages/shared/src/types/log.ts
 * Purpose: Console log entry types used by the daemon ring buffer, the
 *          event bus console:* namespace, and the GUI Console panel.
 * Dependencies: none
 */

/** Severity levels, ordered debug < info < warn < error. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single line in the office console. */
export interface LogEntry {
  /** Epoch ms. */
  ts: number;
  level: LogLevel;
  /** Where the entry came from, e.g. "daemon", "worker:FE-01", "manager". */
  source: string;
  message: string;
  fields?: Record<string, unknown>;
}
