/**
 * Path: packages/orchestrator/src/worker/worker.ts
 * Purpose: Worker — the long-running pull actor (PRD 2.12). Infinite loop:
 *          claim todo -> execute via the core Agent -> report -> repeat.
 *          Errors are caught and the loop continues (a worker never breaks
 *          the office). Heartbeats every 5s; a stop mid-task requeues the
 *          todo so nothing is lost (resume-safe).
 * Dependencies: ../store/sqlite-store, ../todo/queue, ../events/bus,
 *              @tagent-office/core (Agent), @tagent-office/shared
 */
import type { Agent, AgentEvent, AgentRunResult } from '@tagent-office/core';
import {
  HEARTBEAT_INTERVAL_MS,
  WORKER_POLL_INTERVAL_MS,
  type Logger,
  type Todo,
  type WorkerRole,
  type WorkerState,
} from '@tagent-office/shared';
import type { EventBus } from '../events/bus';
import type { SqliteStore } from '../store/sqlite-store';
import type { TaskQueue } from '../todo/queue';

/** Constructor deps. */
export interface WorkerDeps {
  id: string;
  role: WorkerRole;
  store: SqliteStore;
  queue: TaskQueue;
  bus: EventBus;
  agent: Agent;
  logger?: Logger;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
}

/** One office worker (FE-01, BE-01, ...). */
export class Worker {
  readonly id: string;
  readonly role: WorkerRole;
  private state: WorkerState = 'init';
  private running = false;
  private readonly abort = new AbortController();
  private runPromise: Promise<void> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: WorkerDeps) {
    this.id = deps.id;
    this.role = deps.role;
  }

  /** Current state (mirror of the persisted row). */
  get workerState(): WorkerState {
    return this.state;
  }

  /** Start the loops. Resolves only after requestStop(). */
  async start(): Promise<void> {
    this.running = true;
    this.persistState('idle', null, null);
    this.deps.bus.emit('office:worker.spawned', { workerId: this.id, role: this.role });
    this.deps.logger?.info('worker started', { workerId: this.id, role: this.role });

    const heartbeatIntervalMs = this.deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimer = setInterval(() => {
      this.deps.store.updateWorker(this.id, { lastHeartbeat: Date.now() });
    }, heartbeatIntervalMs);
    this.deps.store.updateWorker(this.id, { lastHeartbeat: Date.now() });

    this.runPromise = this.runLoop();
    await this.runPromise;
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.persistState('dead', null, null);
  }

  /** Politely stop: finish nothing, requeue anything in flight. */
  requestStop(): void {
    this.running = false;
    this.persistState('stopping', null, null);
    this.abort.abort();
  }

  /** Wait for the loop to unwind (used by the pool). */
  async join(): Promise<void> {
    await this.runPromise;
  }

  private async runLoop(): Promise<void> {
    const pollMs = this.deps.pollIntervalMs ?? WORKER_POLL_INTERVAL_MS;
    let idleAnnounced = false;

    while (this.running) {
      let todo: Todo | null = null;
      try {
        todo = this.deps.queue.claimNextFor(this.id, this.role);
      } catch (error: unknown) {
        this.logError('claim failed', error);
        await this.abortableSleep(pollMs);
        continue;
      }

      if (todo === null) {
        if (!idleAnnounced) {
          idleAnnounced = true;
          this.persistState('idle', null, null);
          this.deps.bus.emit('office:worker.idle', { workerId: this.id, role: this.role });
        }
        await this.abortableSleep(pollMs);
        continue;
      }
      idleAnnounced = false;

      try {
        await this.execute(todo);
      } catch (error: unknown) {
        // The loop must survive anything a single todo can throw.
        this.logError('todo execution crashed', error, todo.id);
        this.handleFailure(todo, `worker crash: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.persistState('idle', null, null);
      }
    }
  }

  private async execute(todo: Todo): Promise<void> {
    this.persistState('working', todo.id, 'in_progress');
    const started = this.deps.store.updateTodo(todo.id, { status: 'in_progress' });
    this.deps.bus.emit('office:todo.assigned', { todo: started, workerId: this.id });
    this.deps.bus.emit('office:todo.updated', { todo: started });
    this.deps.store.appendTodoEvent(todo.id, 'started', { workerId: this.id });

    const result: AgentRunResult = await this.deps.agent.run(
      {
        todoId: todo.id,
        title: todo.title,
        description: todo.description,
        acceptance: todo.acceptance,
        directiveText: this.deps.store.getDirective(todo.parentDirective)?.text ?? todo.parentDirective,
      },
      (event) => this.forwardAgentEvent(todo.id, event),
    );

    if (result.status === 'done') {
      const nextStatus = todo.requiresQA ? 'ready_for_test' : 'done';
      const updated = this.deps.store.updateTodo(todo.id, {
        status: nextStatus,
        filesChanged: result.filesChanged,
        evidence: { summary: result.summary, steps: result.steps.length, tokens: result.tokens },
        commitHash: null,
      });
      this.deps.store.appendTodoEvent(todo.id, 'completed', { workerId: this.id, summary: result.summary });
      if (nextStatus === 'done') {
        this.deps.bus.emit('office:todo.done', { todo: updated });
      } else {
        this.deps.bus.emit('office:todo.ready', { todo: updated });
      }
      this.deps.bus.emit('office:agent.task_done', {
        workerId: this.id,
        todoId: todo.id,
        status: 'done',
        summary: result.summary ?? 'task finished',
      });
    } else {
      this.handleFailure(todo, result.summary ?? `run ended as ${result.status}`);
    }
  }

  private handleFailure(todo: Todo, reason: string): void {
    const attempts = todo.attempts + 1;
    if (attempts >= todo.maxAttempts) {
      const updated = this.deps.store.updateTodo(todo.id, { status: 'failed', attempts });
      this.deps.store.appendTodoEvent(todo.id, 'failed_permanently', { attempts, reason });
      this.deps.bus.emit('office:todo.failed', { todo: updated, reason });
    } else {
      const updated = this.deps.store.updateTodo(todo.id, { status: 'pending', attempts, assignee: null });
      this.deps.store.appendTodoEvent(todo.id, 'retry_scheduled', { attempts, reason });
      this.deps.bus.emit('office:todo.updated', { todo: updated });
    }
  }

  /** Forward granular agent events onto the bus with full context. */
  private forwardAgentEvent(todoId: string, event: AgentEvent): void {
    if (event.type === 'progress') {
      this.deps.bus.emit('office:agent.progress', { workerId: this.id, todoId, step: event.step, thought: event.thought });
      return;
    }
    if (event.type === 'tool_call') {
      this.deps.bus.emit('office:agent.tool_call', { workerId: this.id, todoId, tool: event.tool, args: event.args });
      return;
    }
    this.deps.bus.emit('office:agent.tool_result', {
      workerId: this.id,
      todoId,
      tool: event.tool,
      ok: event.ok,
      summary: event.output.slice(0, 200),
    });
  }

  private persistState(state: WorkerState, currentTodoId: string | null, currentTodoState: string | null): void {
    this.state = state;
    this.deps.store.upsertWorker({
      id: this.id,
      role: this.role,
      state,
      currentTodoId,
      currentTodoState,
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
    });
    this.deps.bus.emit('office:agent.status', { workerId: this.id, role: this.role, state });
  }

  private async abortableSleep(ms: number): Promise<void> {
    if (this.abort.signal.aborted) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.abort.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      this.abort.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private logError(message: string, error: unknown, todoId?: string): void {
    this.deps.logger?.error(`worker: ${message}`, {
      workerId: this.id,
      todoId: todoId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
