/**
 * Path: packages/daemon/src/routes/directives.ts
 * Purpose: Directive intake over HTTP. POST /api/directives is the CEO's
 *          front door: text in -> Manager breakdown (or clarification) out.
 * Dependencies: hono, ../runtime, @tagent-office/shared
 */
import type { Hono } from 'hono';
import { isRecord, ValidationError } from '@tagent-office/shared';
import type { Runtime } from '../runtime';

/** Mount directive routes. */
export function registerDirectiveRoutes(app: Hono, runtime: Runtime): void {
  app.get('/api/directives', (c) => {
    const limitParam = c.req.query('limit');
    const limit = limitParam !== undefined ? Number.parseInt(limitParam, 10) : 100;
    if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
      throw new ValidationError('limit must be an integer in [1, 500]');
    }
    return c.json({ directives: runtime.store.listDirectives(limit) });
  });

  app.post('/api/directives', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body) || typeof body['text'] !== 'string' || body['text'].trim().length === 0) {
      throw new ValidationError('Body must be { "text": non-empty string }');
    }
    const text = body['text'].trim();
    if (text.length > 2_000) {
      throw new ValidationError('Directive text must be at most 2000 characters');
    }
    const result = await runtime.manager.receiveDirective(text);
    if (!result.ok) throw result.error;
    return c.json({ directive: result.value }, 202);
  });

  app.get('/api/directives/:id', (c) => {
    const id = c.req.param('id');
    const directive = runtime.store.getDirective(id);
    if (directive === null) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Directive not found: ${id}` } }, 404);
    }
    const todos = runtime.store.listTodos({ directiveId: id });
    return c.json({ directive, todos });
  });
}
