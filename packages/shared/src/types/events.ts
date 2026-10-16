/**
 * Path: packages/shared/src/types/events.ts
 * Purpose: Typed event map for the event bus -> WebSocket bridge (PRD 2.26).
 *          Namespaces: office:*, source:*, console:*, preview:*.
 * Dependencies: ./todo, ./directive, ./clarification, ./worker, ./log
 */
import type { Clarification } from './clarification';
import type { Directive } from './directive';
import type { LogEntry } from './log';
import type { Todo } from './todo';
import type { WorkerRole, WorkerState } from './worker';

/** All events and their payloads. The bus and socket bridge are typed on this. */
export interface EventMap {
  // -- office: agents ----------------------------------------------------
  'office:agent.status': { workerId: string; role: WorkerRole; state: WorkerState };
  'office:agent.tool_call': { workerId: string; todoId: string; tool: string; args: unknown };
  'office:agent.tool_result': { workerId: string; todoId: string; tool: string; ok: boolean; summary: string };
  'office:agent.progress': { workerId: string; todoId: string; step: number; thought: string };
  'office:agent.task_done': { workerId: string; todoId: string; status: 'done' | 'failed'; summary: string };
  'office:agent.moved': { workerId: string; from: string; to: string };

  // -- office: todos -----------------------------------------------------
  'office:todo.created': { todo: Todo };
  'office:todo.updated': { todo: Todo };
  'office:todo.assigned': { todo: Todo; workerId: string };
  'office:todo.ready': { todo: Todo };
  'office:todo.failed': { todo: Todo; reason: string };
  'office:todo.done': { todo: Todo };
  'office:task.assigned': { todoId: string; workerId: string };
  'office:task.done': { todoId: string };
  'office:task.fanout': { directiveId: string; todoIds: string[] };

  // -- office: directives ------------------------------------------------
  'office:directive.received': { directive: Directive };
  'office:directive.queued': { directive: Directive };
  'office:directive.done': { directive: Directive };

  // -- office: clarifications --------------------------------------------
  'office:clarification.created': { clarification: Clarification };
  'office:clarification.answered': { clarification: Clarification };

  // -- office: iterations --------------------------------------------------
  'office:iteration.started': { iterationId: string; directiveId: string; number: number };
  'office:iteration.done': { iterationId: string; directiveId: string; number: number; verdict: string; summary: string };

  // -- office: project & workers ------------------------------------------
  'office:project.done': { directiveId: string };
  'office:worker.spawned': { workerId: string; role: WorkerRole };
  'office:worker.idle': { workerId: string; role: WorkerRole };
  'office:worker.dead': { workerId: string; role: WorkerRole; reason: string };

  // -- source: file system (Phase 2) ---------------------------------------
  'source:file.changed': { path: string };
  'source:file.created': { path: string };
  'source:file.deleted': { path: string };
  'source:diff.ready': { path: string };

  // -- console --------------------------------------------------------------
  'console:log.append': { entry: LogEntry };
  'console:bash.output': { workerId: string; todoId: string; exitCode: number; output: string };
  'console:error': { entry: LogEntry };
  'console:warn': { entry: LogEntry };

  // -- preview (Phase 5) -----------------------------------------------------
  'preview:updated': { mode: string };
  'preview:mode_changed': { mode: string };
  'preview:status': { status: string };
}

/** Union of all event names. */
export type EventName = keyof EventMap;

/** Handler signature. */
export type EventHandler<K extends EventName> = (payload: EventMap[K]) => void;
