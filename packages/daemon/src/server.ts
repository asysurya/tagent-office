/**
 * Path: packages/daemon/src/server.ts
 * Purpose: HTTP assembly — Hono app + middleware + routes + socket.io on ONE
 *          node http server (standard /socket.io path). The daemon runs
 *          standalone: no supervisor loop, no auto-restart magic
 *          (anti-pattern #9).
 * Dependencies: hono, @hono/node-server, ./runtime, ./socket, ./routes/*,
 *              ./middleware/*, ./static
 */
import { createServer, type RequestListener, type ServerOptions } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/logger';
import { registerConfigRoutes } from './routes/config';
import { registerDirectiveRoutes } from './routes/directives';
import { registerHealthRoutes } from './routes/health';
import { registerTodoRoutes } from './routes/todos';
import { registerWorkerRoutes } from './routes/workers';
import type { Runtime } from './runtime';
import { mountStaticGui } from './static';
import { attachRealtime } from './socket';

/** Derived adapter option type so the createServer hook stays honest. */
type ServeOptions = NonNullable<Parameters<typeof serve>[0]>;

/** A running daemon handle. */
export interface DaemonHandle {
  port: number;
  httpServer: ReturnType<typeof serve>;
  close(): Promise<void>;
}

/** Build the Hono app (routes + middleware) for a runtime. */
export function createApp(runtime: Runtime): Hono {
  const app = new Hono();
  app.use('*', cors());
  app.use('*', requestLogger(runtime));
  app.onError(errorHandler((message, fields) => runtime.logger.error(message, fields)));

  registerHealthRoutes(app, runtime);
  registerConfigRoutes(app, runtime);
  registerDirectiveRoutes(app, runtime);
  registerTodoRoutes(app, runtime);
  registerWorkerRoutes(app, runtime);

  // GUI static export (Phase 10 embedding; dormant in dev).
  mountStaticGui(app, '../../apps/web/out');

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: `No route: ${c.req.method} ${c.req.path}` } }, 404),
  );
  return app;
}

/** Options for startDaemon. */
export interface StartDaemonOptions {
  runtime: Runtime;
  port?: number;
  /** Called once listening (before the promise resolves). */
  onStarted?: (handle: DaemonHandle) => void;
}

/**
 * Boot the daemon: http server (Hono) + socket.io on the same port.
 * Resolves once the server is listening.
 */
export async function startDaemon(options: StartDaemonOptions): Promise<DaemonHandle> {
  const { runtime } = options;
  const app = createApp(runtime);
  const port = options.port ?? runtime.config.port;

  const createServerWithRealtime = (
    serverOptions: ServerOptions,
    listener?: RequestListener,
  ): ReturnType<typeof createServer> => {
    const created = createServer(serverOptions, listener);
    attachRealtime(created, runtime);
    return created;
  };

  const server = serve({
    fetch: app.fetch,
    port,
    createServer: createServerWithRealtime,
  } as ServeOptions);

  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`daemon failed to listen on port ${port}`)), 5_000);
      server.once('listening', () => {
        clearTimeout(timer);
        resolve();
      });
      server.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`daemon has no usable address on port ${port}`);
  }

  const handle: DaemonHandle = {
    port: address.port,
    httpServer: server,
    close: async (): Promise<void> => {
      await runtime.stop();
      runtime.store.close();
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      });
    },
  };
  options.onStarted?.(handle);
  return handle;
}
