/**
 * Path: packages/daemon/test/socket-spike.test.ts
 * Purpose: Infrastructure proof (anti-pattern #1): Hono + @hono/node-server
 *          + socket.io v4 on a SINGLE port under Bun with the STANDARD
 *          path '/socket.io' — no sandbox ?XTransformPort pattern. Also
 *          proves the client-initiated snapshot handshake (anti-pattern #8).
 *          This test is intentionally self-contained (no daemon internals)
 *          so it validates the stack itself, independent of our wiring.
 * Dependencies: hono, @hono/node-server, socket.io, socket.io-client
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer, type RequestListener, type ServerOptions } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';

const app = new Hono();
app.get('/api/health', (c) => c.json({ status: 'ok' }));

/** Derived adapter option types so the cast below stays honest. */
type ServeOptions = NonNullable<Parameters<typeof serve>[0]>;

let io: Server | null = null;
let server: ReturnType<typeof serve> | null = null;
let port = 0;

function createServerWithIo(options: ServerOptions, listener?: RequestListener): ReturnType<typeof createServer> {
  const created = createServer(options, listener);
  io = new Server(created, { path: '/socket.io', cors: { origin: '*' } });
  io.on('connection', (socket) => {
    socket.on('request:snapshot', () => {
      socket.emit('snapshot', { hello: 'world', via: 'single-port-socket-io' });
    });
  });
  return created;
}

beforeAll(() => {
  const options = {
    fetch: app.fetch,
    port: 0,
    createServer: createServerWithIo,
  } as ServeOptions;
  server = serve(options);
  const address = server.address() as { port: number };
  port = address.port;
});

afterAll(() => {
  io?.close();
  server?.close();
});

describe('single-port Hono + socket.io (infrastructure proof)', () => {
  test('HTTP routes answer on the port', async () => {
    const response = await fetch(`http://localhost:${port}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body['status']).toBe('ok');
  });

  test('socket.io connects via the standard /socket.io path and answers the snapshot handshake', async () => {
    const client = createClient(`http://localhost:${port}`, { path: '/socket.io' });
    const snapshot = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('snapshot handshake timeout')), 4000);
      client.on('connect', () => {
        client.emit('request:snapshot');
      });
      client.on('snapshot', (payload: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.on('connect_error', (error: Error) => reject(error));
    });
    expect(snapshot['via']).toBe('single-port-socket-io');
    client.disconnect();
  });
});
