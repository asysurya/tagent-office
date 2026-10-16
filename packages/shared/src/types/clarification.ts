/**
 * Path: packages/shared/src/types/clarification.ts
 * Purpose: Clarification domain types — how the Manager asks the user when a
 *          directive's confidence is below the threshold (PRD 2.14).
 * Dependencies: none
 */

/** Lifecycle of a clarification session. */
export type ClarificationStatus = 'pending' | 'answered' | 'superseded';

/** Supported question types (PRD 2.14). */
export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'free_text'
  | 'long_text'
  | 'number'
  | 'boolean'
  | 'file_upload'
  | 'ranking'
  | 'confirm';

/** A single question in a clarification session. */
export interface ClarificationQuestion {
  id: string;
  type: QuestionType;
  question: string;
  /** For choice/ranking types. */
  options?: string[];
}

/** A clarification session (max 7 questions per session, PRD 2.14). */
export interface Clarification {
  /** Stable human-readable id, e.g. "clar-001". */
  id: string;
  directiveId: string;
  status: ClarificationStatus;
  /** Manager's reasoning for asking, shown to the user. */
  context: string;
  questions: ClarificationQuestion[];
  /** Question id -> answer value, once the user replied. */
  answers: Record<string, unknown> | null;
  /** Free-form note the user may attach (text; attachments in later phases). */
  note: string | null;
  /** Manager's re-understanding after answers arrived. */
  resolution: string | null;
  createdAt: number;
  answeredAt: number | null;
}
