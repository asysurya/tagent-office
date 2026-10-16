/**
 * Path: packages/shared/src/types/iteration.ts
 * Purpose: Iteration domain types — one completed directive equals one
 *          iteration log entry (PRD 2.9, 2.17).
 * Dependencies: none
 */

/** Outcome of an iteration. */
export type IterationVerdict = 'passed' | 'failed' | 'partial';

/** A completed directive's record. */
export interface Iteration {
  /** Stable human-readable id, e.g. "iter-001". */
  id: string;
  directiveId: string;
  /** 1-based sequence number. */
  number: number;
  startedAt: number;
  endedAt: number | null;
  verdict: IterationVerdict | null;
  summary: string | null;
  learnings: string | null;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
}
