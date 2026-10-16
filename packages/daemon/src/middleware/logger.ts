/**
 * Path: packages/daemon/src/middleware/logger.ts
 * Purpose: Request logging middleware — structured, per-request, zero
 *          console.log (work rules #4, #14).
 * Dependencies: hono, ../runtime
 */
import type { MiddlewareHandler } from 'hono';
import type { Runtime } from '../runtime';

/** Create the request logger middleware. */
export function requestLogger(runtime: Runtime): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    runtime.logger.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    });
  };
}
