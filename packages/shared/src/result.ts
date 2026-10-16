/**
 * Path: packages/shared/src/result.ts
 * Purpose: Result<T, E> — the error-handling primitive for all public APIs.
 *          No silent catches, no throw-across-boundaries for expected errors.
 * Dependencies: none
 */

/** Success or failure, explicitly. */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Wrap a success value. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wrap a failure value. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Type guard narrowing to the success branch. */
export function isOk<T, E>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: true }> {
  return result.ok === true;
}

/** Type guard narrowing to the failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: false }> {
  return result.ok === false;
}

/** Extract the value or fall back. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Run a sync fn and convert thrown errors into an err() result. Use sparingly —
 * for truly unexpected throws only, never as a control-flow band-aid.
 */
export function attempt<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (error: unknown) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Await a promise and convert rejections into an err() result.
 */
export async function attemptAsync<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await promise);
  } catch (error: unknown) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
