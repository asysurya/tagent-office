/**
 * Path: packages/daemon/src/routes/todos.ts
 * Purpose: Read-only todo inspection: list with filters, detail + audit
 *          events. Todo lifecycle changes flow through the workers/manager,
 *          never through manual PATCHing (single writer principle).
 * Dependencies: hono, ../runtime, @tagent-office/shared
 */
import type { Hono } from 'hono';
import { ValidationError, type TodoStatus } from '@tagent-office/shared';
import type { Runtime } from '../runtime';

const VALID_STATUSES: readonly TodoStatus[] = [
  'pending',
  'assigned',
  'in_progress',
  'ready_for_test',
  'testing',
  'done',
  'failed',
  'blocked',
  'paused',
  'escalated',
  'cancelled',
];

/** Mount todo routes. */
export function registerTodoRoutes(app: Hono, runtime: Runtime): void {
  app.get('/api/todos', (c) => {
    const statusParam = c.req.query('status');
    const directiveId = c.req.query('directive');
    const statuses =
      statusParam === undefined
        ? undefined
        : statusParam
            .split(',')
            .map((status) => status.trim())
            .filter((status) => {
              if (!VALID_STATUSES.includes(status as TodoStatus)) {
                throw new ValidationError(`Unknown todo status filter: ${status}`);
              }
              return true;
            }) as TodoStatus[];
    const todos = runtime.store.listTodos({
      status: statuses,
      ...(directiveId !== undefined ? { directiveId } : {}),
    });
    return c.json({ todos });
  });

  app.get('/api/todos/:id', (c) => {
    const id = c.req.param('id');
    const todo = runtime.store.getTodo(id);
    if (todo === null) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Todo not found: ${id}` } }, 404);
    }
    return c.json({ todo, events: runtime.store.listTodoEvents(id) });
  });
}
