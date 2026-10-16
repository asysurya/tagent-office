/**
 * Path: packages/shared/src/types/todo.ts
 * Purpose: Todo domain types — the atom of work in Tagent Office (PRD 2.10).
 *          Note: the domain field is `commitHash`; the SQLite column is
 *          `commit_hash` (never `commit` — reserved keyword in SQLite).
 * Dependencies: none
 */

/** Lifecycle of a todo item. */
export type TodoStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'ready_for_test'
  | 'testing'
  | 'done'
  | 'failed'
  | 'blocked'
  | 'paused'
  | 'escalated'
  | 'cancelled';

/** What kind of work a todo represents. */
export type TodoType = 'feature' | 'bug' | 'refactor' | 'chore' | 'investigate' | 'test';

/** Priority band (PRD 2.11: critical 90-100, high 70-89, normal 40-69, low 0-39). */
export type TodoCategory = 'critical' | 'high' | 'normal' | 'low';

/** Which worker role should pick this todo up. */
export type TodoRole = 'frontend' | 'backend' | 'qa' | 'any';

/** Who created the todo. */
export type TodoCreatedBy = 'manager' | 'user' | 'qa';

/** A single atom of work (PRD 2.10). */
export interface Todo {
  /** Stable human-readable id, e.g. "T-001". */
  id: string;
  title: string;
  description: string;
  type: TodoType;
  /** 0-100, recomputed by the Manager from category + modifiers. */
  priority: number;
  category: TodoCategory;
  status: TodoStatus;
  role: TodoRole;
  /** Worker id (e.g. "FE-01") or null while unassigned. */
  assignee: string | null;
  /** Ids of todos that must be 'done' before this one is eligible. */
  deps: string[];
  /** Ids of todos blocked by this one. */
  blocks: string[];
  createdBy: TodoCreatedBy;
  /** Directive id this todo was created in. */
  createdIn: string;
  parentDirective: string;
  parentTodo: string | null;
  acceptance: string[];
  testScenarios: string[];
  requiresQA: boolean;
  /** Git commit hash once landed (SQLite column: commit_hash). */
  commitHash: string | null;
  filesChanged: string[];
  evidence: Record<string, unknown> | null;
  attempts: number;
  /** Default 3 (PRD 2.24 #5). */
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
}

/** A todo as produced by the Manager breakdown, before store assignment. */
export interface TodoDraft {
  title: string;
  description: string;
  type: TodoType;
  role: TodoRole;
  category: TodoCategory;
  /** Optional explicit priority hint; recomputed by the queue when absent. */
  priority?: number;
  acceptance: string[];
  testScenarios: string[];
  requiresQA: boolean;
  /** Local references to other drafts by title, resolved to ids on insert. */
  deps?: string[];
}

/** Full LLM breakdown answer for one directive. */
export interface BreakdownResult {
  /** 0-1; below CONFIDENCE_THRESHOLD (0.85) triggers a clarification. */
  confidence: number;
  todos: TodoDraft[];
  notes?: string;
}

/** Payload filters for listing todos. */
export interface TodoFilters {
  status?: TodoStatus[];
  role?: TodoRole;
  directiveId?: string;
}
