/**
 * Path: packages/daemon/src/routes/health.ts
 * Purpose: GET /api/health — liveness + quick counters. Used by the GUI
 *          badge, the CLI, and uptime checks.
 * Dependencies: hono, ../runtime, @tagent-office/shared
 */
import type { Hono } from 'hono';
import { APP_VERSION } from '@tagent-office/shared';
import type { Runtime } from '../runtime';

/** Mount the health route. */
export function registerHealthRoutes(app: Hono, runtime: Runtime): void {
  app.get('/api/health', (c) => {
    const todos = runtime.store.listTodos();
    return c.json({
      status: 'ok',
      version: APP_VERSION,
      uptimeMs: Date.now() - runtime.startedAt,
      workspace: runtime.config.workspace,
      workers: {
        total: runtime.store.listWorkers().length,
        idle: runtime.store.listWorkers().filter((worker) => worker.state === 'idle').length,
        working: runtime.store.listWorkers().filter((worker) => worker.state === 'working').length,
      },
      todos: {
        total: todos.length,
        pending: todos.filter((todo) => todo.status === 'pending').length,
        inFlight: todos.filter((todo) => todo.status === 'assigned' || todo.status === 'in_progress').length,
        done: todos.filter((todo) => todo.status === 'done').length,
        failed: todos.filter((todo) => todo.status === 'failed').length,
      },
    });
  });
}
