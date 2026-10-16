/**
 * Path: apps/web/src/lib/store.ts
 * Purpose: Zustand store — realtime client state ONLY (connection, console
 *          ring, daemon info). Server data (todos/directives/workers) lives
 *          in TanStack Query and is invalidated by socket events: the
 *          canonical split (PRD 2.6 state stack).
 * Dependencies: zustand, @tagent-office/shared
 */
import { create } from 'zustand';
import type { LogEntry, SnapshotPayload } from '@tagent-office/shared';

/** Connection lifecycle. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

const LOG_CAP = 500;

interface OfficeStore {
  connection: ConnectionState;
  daemonVersion: string | null;
  logs: LogEntry[];
  setConnection(state: ConnectionState): void;
  applySnapshot(snapshot: SnapshotPayload): void;
  appendLog(entry: LogEntry): void;
}

/** The realtime half of the GUI state. */
export const useOfficeStore = create<OfficeStore>((set) => ({
  connection: 'connecting',
  daemonVersion: null,
  logs: [],
  setConnection: (state) => set({ connection: state }),
  applySnapshot: (snapshot) =>
    set({
      daemonVersion: snapshot.version,
      logs: [...snapshot.logs].slice(-LOG_CAP),
    }),
  appendLog: (entry) =>
    set((current) => {
      const logs = [...current.logs, entry];
      if (logs.length > LOG_CAP) logs.splice(0, logs.length - LOG_CAP);
      return { logs };
    }),
}));
