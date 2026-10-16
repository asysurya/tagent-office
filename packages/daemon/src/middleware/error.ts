/**
 * Path: packages/daemon/src/middleware/error.ts
 * Purpose: Central error handler — TagentError families map to honest HTTP
 *          statuses; anything unexpected is logged and becomes a 500.
 *          No silent catches (work rule #3).
 * Dependencies: hono, @tagent-office/shared
 */
import type { ErrorHandler } from 'hono';
import { TagentError } from '@tagent-office/shared';

/** HTTP status per TagentError code (Hono-typed literal union). */
function statusFor(code: string): 400 | 403 | 404 | 500 | 502 {
  switch (code) {
    case 'VALIDATION':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'PERMISSION':
      return 403;
    case 'PROVIDER':
      return 502;
    default:
      return 500;
  }
}

/** Create the app-wide error handler. */
export function errorHandler(log: (message: string, fields?: Record<string, unknown>) => void): ErrorHandler {
  return (error, c) => {
    if (error instanceof TagentError) {
      log('request failed', error.toLogFields());
      return c.json(
        { error: { code: error.code, message: error.message, details: error.details ?? null } },
        statusFor(error.code),
      );
    }
    log('request crashed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: 'INTERNAL', message: 'Internal daemon error', details: null } },
      500,
    );
  };
}
