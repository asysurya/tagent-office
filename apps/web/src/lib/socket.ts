/**
 * Path: apps/web/src/lib/socket.ts
 * Purpose: socket.io client — the office's realtime nervous system. Connects
 *          to the daemon, asks for a snapshot AFTER connecting (anti-pattern
 *          #8: the client initiates; the server never pushes first), then
 *          applies live events: TanStack Query invalidations for server
 *          state, zustand appends for the console ring.
 * Dependencies: socket.io-client, @tanstack/react-query, @tagent-office/shared, ./store
 */
import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import type { LogEntry, SnapshotPayload } from '@tagent-office/shared';
import { useOfficeStore } from './store';

const DAEMON_URL = process.env.NEXT_PUBLIC_DAEMON_URL ?? 'http://localhost:4020';

/** Connection options per mode (direct vs same-origin rewrites). */
function connectionOptions(): Parameters<typeof io>[1] {
  if (DAEMON_URL.length > 0) {
    return { path: '/socket.io' }; // standard path, direct to the daemon
  }
  return { path: '/tagent-socket' }; // same-origin proxy mode
}

let socketRef: Socket | null = null;

/** Connect once per browser session; returns the live socket. */
export function connectOfficeSocket(queryClient: QueryClient): Socket {
  if (socketRef !== null) return socketRef;

  const socket = io(DAEMON_URL.length > 0 ? DAEMON_URL : '', connectionOptions());
  socketRef = socket;

  socket.on('connect', () => {
    useOfficeStore.getState().setConnection('connected');
    socket.emit('request:snapshot'); // client-initiated handshake
  });

  socket.on('disconnect', () => {
    useOfficeStore.getState().setConnection('disconnected');
  });

  socket.on('snapshot', (payload: SnapshotPayload) => {
    useOfficeStore.getState().applySnapshot(payload);
    // Seed the query caches with the snapshot, then let events invalidate.
    void queryClient.setQueryData(['health'], undefined);
    queryClient.invalidateQueries({ queryKey: ['todos'] });
    queryClient.invalidateQueries({ queryKey: ['directives'] });
    queryClient.invalidateQueries({ queryKey: ['workers'] });
  });

  // -- office: todos ------------------------------------------------------
  const invalidateTodos = (): void => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  };
  socket.on('office:todo.created', invalidateTodos);
  socket.on('office:todo.updated', invalidateTodos);
  socket.on('office:todo.assigned', invalidateTodos);
  socket.on('office:todo.ready', invalidateTodos);
  socket.on('office:todo.failed', invalidateTodos);
  socket.on('office:todo.done', invalidateTodos);

  // -- office: directives ---------------------------------------------------
  const invalidateDirectives = (): void => {
    queryClient.invalidateQueries({ queryKey: ['directives'] });
  };
  socket.on('office:directive.received', invalidateDirectives);
  socket.on('office:directive.queued', invalidateDirectives);
  socket.on('office:directive.done', invalidateDirectives);
  socket.on('office:clarification.created', invalidateDirectives);

  // -- office: workers -------------------------------------------------------
  const invalidateWorkers = (): void => {
    queryClient.invalidateQueries({ queryKey: ['workers'] });
  };
  socket.on('office:worker.spawned', invalidateWorkers);
  socket.on('office:worker.idle', invalidateWorkers);
  socket.on('office:worker.dead', invalidateWorkers);
  socket.on('office:agent.status', invalidateWorkers);

  // -- console ---------------------------------------------------------------
  socket.on('console:log.append', (payload: { entry: LogEntry }) => {
    useOfficeStore.getState().appendLog(payload['entry']);
  });

  return socket;
}

/** Test/internals hook. */
export function disconnectOfficeSocket(): void {
  socketRef?.disconnect();
  socketRef = null;
}
