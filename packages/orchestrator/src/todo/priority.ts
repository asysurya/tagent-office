/**
 * Path: packages/orchestrator/src/todo/priority.ts
 * Purpose: Priority model per PRD 2.11 — base per type, category bands,
 *          modifiers (blocks, aging, deps satisfied, user boost, bug),
 *          capped to [0, 100].
 * Dependencies: @tagent-office/shared
 */
import {
  CATEGORY_RANGES,
  DEFAULT_PRIORITY_BY_TYPE,
  PRIORITY_CAP,
  PRIORITY_FLOOR,
  PRIORITY_MODIFIER,
  type Todo,
  type TodoCategory,
  type TodoType,
} from '@tagent-office/shared';

/** Inputs to the priority computation. */
export interface PriorityInput {
  type: TodoType;
  category: TodoCategory;
  /** How many todos this todo blocks. */
  blocksCount: number;
  /** Minutes since creation. */
  ageMinutes: number;
  /** True when every dependency is done (todo is unblocked). */
  depsSatisfied: boolean;
  /** User explicitly boosted this todo. */
  userBoost: boolean;
  /** Explicit base override (rare). */
  base?: number;
}

/** Category-appropriate base: bugs go critical-high, features normal. */
function baseFor(type: TodoType, category: TodoCategory, override?: number): number {
  if (override !== undefined) return override;
  if (type === 'bug' && category === 'critical') return 95;
  if (type === 'feature' && category === 'critical') return 80;
  return DEFAULT_PRIORITY_BY_TYPE[type] ?? 60;
}

/** Compute the 0-100 priority (PRD 2.11). */
export function computePriority(input: PriorityInput): number {
  let score = baseFor(input.type, input.category, input.base);

  if (input.blocksCount >= 3) score += PRIORITY_MODIFIER['BLOCKS_MANY'] ?? 20;
  else if (input.blocksCount >= 1) score += PRIORITY_MODIFIER['BLOCKS_SOME'] ?? 10;

  const aging = Math.min(
    Math.floor(input.ageMinutes) * (PRIORITY_MODIFIER['AGING_PER_MINUTE'] ?? 2),
    PRIORITY_MODIFIER['AGING_MAX'] ?? 20,
  );
  score += aging;

  if (input.depsSatisfied) score += PRIORITY_MODIFIER['DEPS_SATISFIED'] ?? 15;
  if (input.userBoost) score += PRIORITY_MODIFIER['USER_BOOST'] ?? 30;
  if (input.type === 'bug') score += PRIORITY_MODIFIER['BUG'] ?? 10;

  return Math.max(PRIORITY_FLOOR, Math.min(PRIORITY_CAP, score));
}

/** Map a priority score back to its category band. */
export function categoryForPriority(priority: number): TodoCategory {
  for (const [category, range] of Object.entries(CATEGORY_RANGES)) {
    const [low, high] = range as readonly [number, number];
    if (priority >= low && priority <= high) return category as TodoCategory;
  }
  return priority >= 90 ? 'critical' : 'low';
}

/** Recompute inputs for one todo against the store snapshot. */
export function priorityInputForTodo(
  todo: Todo,
  blocksCount: number,
  depsSatisfied: boolean,
  now: number,
): PriorityInput {
  return {
    type: todo.type,
    category: todo.category,
    blocksCount,
    ageMinutes: (now - todo.createdAt) / 60_000,
    depsSatisfied: depsSatisfied || todo.deps.length === 0,
    userBoost: false,
    base: undefined,
  };
}
