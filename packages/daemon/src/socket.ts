/**
 * Path: packages/daemon/src/socket.ts
 * Purpose: socket.io v4 bridge on the SAME http server as the REST API —
 *          standard path '/socket.io' (anti-pattern #1: never a sandbox
 *          XTransformPort pattern). Clients drive the handshake: they send
 *          'request:snapshot' after connecting and the server answers with
 *          one 'snapshot' (anti-pattern #8: no push before the client is
 *          ready). Every bus event is broadcast to all connected clients.
 * Dependencies: socket.io, ./runtime, @tagent-office/shared
 */
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { SOCKET_PATH, type EventMap, type EventName } from '@tagent-office/shared';
import type { Runtime } from './runtime';

/** Event names forwarded over the websocket. */
const FORWARDED_EVENTS: readonly EventName[] = [
  'office:agent.status',
  'office:agent.tool_call',
  'office:agent.tool_result',
  'office:agent.progress',
  'office:agent.task_done',
  'office:todo.created',
  'office:todo.updated',
  'office:todo.assigned',
  'office:todo.ready',
  'office:todo.failed',
  'office:todo.done',
  'office:directive.received',
  'office:directive.queued',
  'office:directive.done',
  'office:clarification.created',
  'office:clarification.answered',
  'office:iteration.started',
  'office:iteration.done',
  'office:project.done',
  'office:worker.spawned',
  'office:worker.idle',
  'office:worker.dead',
  'console:log.append',
  'console:bash.output',
];

/**
 * Attach the realtime bridge to the http server.
 * Returns the socket.io server (so the caller can close it on shutdown).
 */
export function attachRealtime(httpServer: HttpServer, runtime: Runtime): Server {
  const io = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    runtime.logger.info('client connected', { socketId: socket.id });
    // Client-driven snapshot handshake (anti-pattern #8).
    socket.on('request:snapshot', () => {
      socket.emit('snapshot', runtime.getSnapshot());
    });
    socket.on('disconnect', (reason) => {
      runtime.logger.info('client disconnected', { socketId: socket.id, reason });
    });
  });

  for (const name of FORWARDED_EVENTS) {
    const forward = (payload: EventMap[EventName]): void => {
      io.emit(name, payload);
    };
    runtime.bus.on(name, forward);
  }

  return io;
}
