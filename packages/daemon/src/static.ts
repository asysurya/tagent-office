/**
 * Path: packages/daemon/src/static.ts
 * Purpose: Serve the compiled GUI from disk when present (Phase 10 binary
 *          embedding). In Phase 1 dev, the GUI runs as `next dev` on :3000
 *          and this stays dormant.
 * Dependencies: hono, node:fs, @hono/node-server/serve-static
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/**
 * Mount static GUI serving when `distDir` exists on disk.
 * Returns true when mounted (SPA fallback to index.html included).
 */
export function mountStaticGui(app: Hono, distDir: string): boolean {
  if (!existsSync(distDir)) return false;
  app.use('/*', serveStatic({ root: distDir }));
  const indexHtml = join(distDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.get('/*', (c) => c.html(readFileSync(indexHtml, 'utf-8')));
  }
  return true;
}
