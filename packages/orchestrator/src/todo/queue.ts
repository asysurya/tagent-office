/**
 * Path: packages/orchestrator/src/todo/queue.ts
 * Purpose: Task queue over the store: priority recalculation (aging, blocks,
 *          deps-satisfied) and atomic claims for the worker pull model.
 * Dependencies: ./priority, ../store/sqlite-store, @tagent-office/shared
 */
import type { Todo, WorkerRole } from '@tagent-office/shared';
import type { SqliteStore } from '../store/sqlite-store';
import { categoryForPriority, computePriority, priorityInputForTodo } from './priority';

/** Options. */
export interface TaskQueueOptions {
  store: SqliteStore;
}

/** Priority + dependency resolution on top of the todos table. */
export class TaskQueue {
  constructor(private readonly options: TaskQueueOptions) {}

  private get store(): SqliteStore {
    return this.options.store;
  }

  /**
   * Recalculate priorities for all pending todos and persist category
   * drift (aging, block counts, dependency satisfaction per PRD 2.11).
   */
  recalcPendingPriorities(now = Date.now()): void {
    const pending = this.store.listTodos({ status: ['pending'] });
    const blocksCount = new Map<string, number>();
    for (const todo of pending) {
      for (const dep of todo.deps) {
        blocksCount.set(dep, (blocksCount.get(dep) ?? 0) + 1);
      }
    }
    for (const todo of pending) {
      const statuses = this.store.statusesOf(todo.deps);
      const depsSatisfied = todo.deps.length > 0 && todo.deps.every((dep) => statuses.get(dep) === 'done');
      const priority = computePriority(
        priorityInputForTodo(todo, blocksCount.get(todo.id) ?? 0, depsSatisfied, now),
      );
      const category = categoryForPriority(priority);
      if (priority !== todo.priority || category !== todo.category) {
        this.store.updateTodo(todo.id, { priority, category });
      }
    }
  }

  /** Atomically claim the next eligible todo for a worker (pull model). */
  claimNextFor(workerId: string, role: WorkerRole): Todo | null {
    return this.store.claimNextTodo(workerId, role);
  }

  /** Todos still pending for diagnostics. */
  pendingCount(): number {
    return this.store.listTodos({ status: ['pending'] }).length;
  }

  /** Requeue a todo that a worker can no longer hold (restart, stop, death). */
  requeue(todoId: string): Todo | null {
    const todo = this.store.getTodo(todoId);
    if (todo === null) return null;
    if (todo.status === 'assigned' || todo.status === 'in_progress') {
      return this.store.updateTodo(todoId, { status: 'pending', assignee: null });
    }
    return todo;
  }
}
