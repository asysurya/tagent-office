/**
 * Path: packages/shared/src/types/directive.ts
 * Purpose: Directive domain types — the natural-language instruction a user
 *          (CEO) gives to the office (PRD 2.9, 2.25).
 * Dependencies: none
 */

/** Lifecycle of a directive. */
export type DirectiveStatus =
  | 'pending_clarification'
  | 'queued'
  | 'in_progress'
  | 'done'
  | 'cancelled';

/** A user directive. */
export interface Directive {
  /** Stable human-readable id, e.g. "dir-001". */
  id: string;
  /** The natural-language instruction. */
  text: string;
  priority: number;
  status: DirectiveStatus;
  /** Set when the directive is waiting on clarification answers. */
  clarificationId: string | null;
  createdAt: number;
  /** Epoch ms when every todo of this directive reached a terminal state. */
  completedAt: number | null;
}
