/**
 * Path: packages/daemon/src/routes/config.ts
 * Purpose: GET /api/config returns a REDACTED config (no API keys ever leave
 *          the daemon); PUT /api/config patches the runtime subset that is
 *          safe to change live (permissions, performance).
 * Dependencies: hono, ../runtime, @tagent-office/shared
 */
import type { Hono } from 'hono';
import { isBoolean, isRecord, redactConfig, ValidationError, type ToolPermission } from '@tagent-office/shared';
import type { Runtime } from '../runtime';

/** Mount config routes. */
export function registerConfigRoutes(app: Hono, runtime: Runtime): void {
  app.get('/api/config', (c) => c.json(redactConfig(runtime.config)));

  app.put('/api/config', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body)) {
      throw new ValidationError('Body must be a JSON object');
    }

    const permissions = body['permissions'];
    if (permissions !== undefined) {
      if (!isRecord(permissions)) throw new ValidationError('permissions must be an object');
      const autoApproveAsk = permissions['autoApproveAsk'];
      if (autoApproveAsk !== undefined && !isBoolean(autoApproveAsk)) {
        throw new ValidationError('permissions.autoApproveAsk must be a boolean');
      }
      const tools = permissions['tools'];
      if (tools !== undefined) {
        if (!isRecord(tools)) throw new ValidationError('permissions.tools must be an object');
        for (const [tool, value] of Object.entries(tools)) {
          if (value !== 'allow' && value !== 'ask' && value !== 'deny') {
            throw new ValidationError(`permissions.tools.${tool} must be allow|ask|deny`);
          }
        }
        const typed: Record<string, ToolPermission> = {};
        for (const [tool, value] of Object.entries(tools)) {
          typed[tool] = value as ToolPermission;
        }
        runtime.config.permissions.tools = typed;
      }
      if (autoApproveAsk !== undefined) runtime.config.permissions.autoApproveAsk = autoApproveAsk;
    }

    const performance = body['performance'];
    if (performance !== undefined) {
      if (!isRecord(performance)) throw new ValidationError('performance must be an object');
      const maxWorkers = performance['maxWorkers'];
      if (maxWorkers !== undefined) {
        if (typeof maxWorkers !== 'number' || !Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 64) {
          throw new ValidationError('performance.maxWorkers must be an integer in [1, 64]');
        }
        runtime.config.performance.maxWorkers = maxWorkers;
      }
    }

    runtime.logger.info('config patched', { keys: Object.keys(body) });
    return c.json(redactConfig(runtime.config));
  });
}
