/**
 * Path: packages/shared/src/guards.ts
 * Purpose: Small reusable type guards for `unknown` values (work rule #1:
 *          unknown + type guards, never `any`).
 * Dependencies: none
 */

/** Type guard: value is a plain, non-array, non-null object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type guard: value is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Type guard: value is a finite number. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Type guard: value is a boolean. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Type guard: value is an array where every item satisfies the predicate. */
export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}

/** Type guard: value is a string array. */
export function isStringArray(value: unknown): value is string[] {
  return isArrayOf(value, (item): item is string => typeof item === 'string');
}
