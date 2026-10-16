/**
 * Path: packages/orchestrator/src/worker/pool.ts
 * Purpose: WorkerPool — spawns N workers by role (anti-pattern #4), owns the
 *          heartbeat watchdog (missed > 15s => dead => requeue todo =>
 *          respawn, PRD 2.12), and requeues in-flight todos on boot for
 *          resume-safety.
 * Dependencies: ./worker, ../store/sqlite-store, ../todo/queue,
 *              ../events/bus, @tagent-office/core, @tagent-office/shared
 */
import type { Agent } from '@tagent-office/core';
import {
  HEARTBEAT_TIMEOUT_MS,
  IdGenerator,
  parseId,
  WORKER_ROLE_PREFIX,
  type Logger,
  type WorkerRole,
} from '@tagent-office/shared';
import type { EventBus } from '../events/bus';
import type { SqliteStore } from '../store/sqlite-store';
import type { TaskQueue } from '../todo/queue';
import { Worker } from './worker';

/** Constructor deps. */
export interface WorkerPoolDeps {
  store: SqliteStore;
  queue: TaskQueue;
  bus: EventBus;
  logger?: Logger;
  /** Builds an Agent bound to a worker identity (wires agent events to the bus). */
  agentFactory: (worker: { id: string; role: WorkerRole }) => Agent;
  /** Roles to boot with, e.g. ["frontend", "backend"]. */
  roles: WorkerRole[];
  /** Hard cap on concurrent workers. */
  maxWorkers: number;
  heartbeatTimeoutMs?: number;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
}

/** Owns all worker instances and their health. */
export class WorkerPool {
  private readonly workers = new Map<string, Worker>();
  private readonly ids: IdGenerator;
  private readonly logger?: Logger;

  constructor(private readonly deps: WorkerPoolDeps) {
    this.logger = deps.logger;
    this.ids = new IdGenerator((prefix) => deps.store.maxSeq(prefix));
  }

  /** Boot: requeue stale todos, mark stale rows dead, spawn one worker per role. */
  async start(): Promise<void> {
    // Resume-safety: any todo left assigned/in_progress from a previous run
    // goes back to the queue before workers start pulling.
    const stale = [
      ...this.deps.store.listTodos({ status: ['assigned'] }),
      ...this.deps.store.listTodos({ status: ['in_progress'] }),
    ];
    for (const todo of stale) {
      this.deps.queue.requeue(todo.id);
      this.deps.store.appendTodoEvent(todo.id, 'requeued_on_boot', {});
      this.logger?.info('requeued stale todo', { todoId: todo.id, previousStatus: todo.status });
    }
    // Rows from a previous process are definitionally dead; marking them so
    // keeps the roster honest and lets spawn() reuse their persistent ids.
    for (const info of this.deps.store.listWorkers()) {
      if (info.state !== 'dead') {
        this.deps.store.updateWorker(info.id, { state: 'dead' });
      }
    }
    for (const role of this.deps.roles) {
      if (this.workers.size >= this.deps.maxWorkers) break;
      this.spawn(role);
    }
    this.logger?.info('worker pool started', {
      workers: [...this.workers.keys()],
      requeued: stale.length,
    });
  }

  /** Spawn (and start) a new worker for a role, respecting the cap.
   *  Reuses the persistent id of the newest dead worker of the same role so
   *  daemon restarts keep stable ids (PRD 2.24 #1) instead of stacking ghosts. */
  spawn(role: WorkerRole): Worker | null {
    if (this.workers.size >= this.deps.maxWorkers) {
      this.logger?.warn('worker cap reached, spawn refused', { role, cap: this.deps.maxWorkers });
      return null;
    }
    const prefix = WORKER_ROLE_PREFIX[role];
    const reusable = this.deps.store
      .listWorkers()
      .filter((info) => info.role === role && info.state === 'dead')
      .sort((a, b) => (parseId(b.id)?.sequence ?? 0) - (parseId(a.id)?.sequence ?? 0))[0];
    const id = reusable?.id ?? this.ids.next(prefix);
    const worker = new Worker({
      id,
      role,
      store: this.deps.store,
      queue: this.deps.queue,
      bus: this.deps.bus,
      agent: this.deps.agentFactory({ id, role }),
      logger: this.logger?.child({ workerId: id }),
      pollIntervalMs: this.deps.pollIntervalMs,
      heartbeatIntervalMs: this.deps.heartbeatIntervalMs,
    });
    this.workers.set(id, worker);
    void worker.start();
    return worker;
  }

  /** Stop every worker and wait for the loops to unwind. */
  async stopAll(): Promise<void> {
    for (const worker of this.workers.values()) {
      worker.requestStop();
    }
    await Promise.all([...this.workers.values()].map((worker) => worker.join()));
    this.workers.clear();
  }

  /** Stop a single worker by id (API + tests). */
  async stopWorker(id: string): Promise<boolean> {
    const worker = this.workers.get(id);
    if (worker === undefined) return false;
    worker.requestStop();
    await worker.join();
    this.workers.delete(id);
    return true;
  }

  /**
   * Heartbeat watchdog: stored workers with a stale heartbeat are marked
   * dead, their in-flight todo is requeued, and a replacement worker with
   * the same id is respawned (PRD 2.12). Async: the dead instance is fully
   * drained (join) BEFORE the respawn so it cannot overwrite the fresh
   * state during unwind.
   */
  async checkHealth(now = Date.now()): Promise<void> {
    const timeoutMs = this.deps.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    for (const info of this.deps.store.listWorkers()) {
      if (info.state === 'dead' || info.state === 'stopping') continue;
      const stale = now - info.lastHeartbeat > timeoutMs;
      if (!stale) continue;

      this.logger?.warn('worker heartbeat missed, restarting', {
        workerId: info.id,
        lastHeartbeat: info.lastHeartbeat,
      });
      this.deps.store.updateWorker(info.id, { state: 'dead' });
      this.deps.bus.emit('office:worker.dead', {
        workerId: info.id,
        role: info.role,
        reason: `heartbeat missed for more than ${timeoutMs}ms`,
      });

      const deadInstance = this.workers.get(info.id);
      if (deadInstance !== undefined) {
        deadInstance.requestStop();
        await deadInstance.join();
        this.workers.delete(info.id);
      }
      for (const todo of this.deps.store.activeTodosOf(info.id)) {
        this.deps.queue.requeue(todo.id);
        this.deps.store.appendTodoEvent(todo.id, 'requeued_worker_dead', { workerId: info.id });
      }

      if (this.workers.size < this.deps.maxWorkers) {
        this.respawn(info.id, info.role);
      }
    }
  }

  /** Respawn under an existing id (persistent worker identity). */
  private respawn(id: string, role: WorkerRole): void {
    const worker = new Worker({
      id,
      role,
      store: this.deps.store,
      queue: this.deps.queue,
      bus: this.deps.bus,
      agent: this.deps.agentFactory({ id, role }),
      logger: this.logger?.child({ workerId: id }),
      pollIntervalMs: this.deps.pollIntervalMs,
      heartbeatIntervalMs: this.deps.heartbeatIntervalMs,
    });
    this.workers.set(id, worker);
    void worker.start();
  }

  /** Worker rows from the store (source of truth). */
  list(): ReturnType<SqliteStore['listWorkers']> {
    return this.deps.store.listWorkers();
  }

  /** Live instance count (for the cap). */
  liveCount(): number {
    return this.workers.size;
  }
}
