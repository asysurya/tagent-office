/**
 * Path: packages/daemon/src/routes/workers.ts
 * Purpose: Worker inspection and control: list, spawn (verification #9: the
 *          pool supports N workers, not a hardcoded 1), and stop.
 * Dependencies: hono, ../runtime, @tagent-office/shared
 */
import type { Hono } from 'hono';
import { isRecord, ValidationError, type WorkerRole } from '@tagent-office/shared';
import type { Runtime } from '../runtime';

const VALID_ROLES: readonly WorkerRole[] = ['frontend', 'backend', 'qa', 'vision'];

/** Mount worker routes. */
export function registerWorkerRoutes(app: Hono, runtime: Runtime): void {
  app.get('/api/workers', (c) => {
    return c.json({ workers: runtime.pool.list() });
  });

  app.post('/api/workers', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body)) throw new ValidationError('Body must be a JSON object');
    const role = body['role'];
    if (typeof role !== 'string' || !VALID_ROLES.includes(role as WorkerRole)) {
      throw new ValidationError(`role must be one of: ${VALID_ROLES.join(', ')}`);
    }
    const count = body['count'] === undefined ? 1 : body['count'];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 16) {
      throw new ValidationError('count must be an integer in [1, 16]');
    }
    const spawned: string[] = [];
    for (let index = 0; index < count; index++) {
      const worker = runtime.pool.spawn(role as WorkerRole);
      if (worker === null) break;
      spawned.push(worker.id);
    }
    return c.json({ spawned }, 201);
  });

  app.post('/api/workers/:id/stop', async (c) => {
    const id = c.req.param('id');
    const stopped = await runtime.pool.stopWorker(id);
    if (!stopped) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Worker not found: ${id}` } }, 404);
    }
    return c.json({ stopped: true });
  });
}
