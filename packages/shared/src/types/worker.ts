/**
 * Path: packages/shared/src/types/worker.ts
 * Purpose: Worker domain types — long-running actors with an infinite pull
 *          loop (PRD 2.12).
 * Dependencies: none
 */

import type { IdPrefix } from '../id';

/** Worker lifecycle: INIT -> IDLE <-> WORKING -> STOPPING -> DEAD. */
export type WorkerState = 'init' | 'idle' | 'working' | 'stopping' | 'dead';

/** Roles a worker can fulfill. */
export type WorkerRole = 'frontend' | 'backend' | 'qa' | 'vision';

/** Id prefix per worker role (FE-01, BE-01, QA-01, VIS-01). */
export const WORKER_ROLE_PREFIX: Record<WorkerRole, IdPrefix> = {
  frontend: 'FE',
  backend: 'BE',
  qa: 'QA',
  vision: 'VIS',
};

/** Runtime snapshot of a worker. */
export interface WorkerInfo {
  id: string;
  role: WorkerRole;
  state: WorkerState;
  currentTodoId: string | null;
  currentTodoState: string | null;
  startedAt: number;
  /** Epoch ms of the last heartbeat (every 5s; stale after 15s). */
  lastHeartbeat: number;
}
