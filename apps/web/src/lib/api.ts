/**
 * Path: apps/web/src/lib/api.ts
 * Purpose: Typed HTTP client for the daemon. Two modes (docs/configuration.md):
 *          DIRECT (default): NEXT_PUBLIC_DAEMON_URL, e.g. http://localhost:4020
 *          SAME-ORIGIN: NEXT_PUBLIC_DAEMON_URL="" -> /api/tagent/* via rewrites.
 * Dependencies: @tagent-office/shared
 */
import type { Directive, Todo, TodoStatus, WorkerInfo } from '@tagent-office/shared';

const DAEMON_URL = process.env.NEXT_PUBLIC_DAEMON_URL ?? 'http://localhost:4020';
const BASE = DAEMON_URL.length > 0 ? `${DAEMON_URL}/api` : '/api/tagent';

/** Health response shape (kept local — it is a route DTO, not a domain type). */
export interface HealthResponse {
  status: string;
  version: string;
  uptimeMs: number;
  workspace: string;
  workers: { total: number; idle: number; working: number };
  todos: { total: number; pending: number; inFlight: number; done: number; failed: number };
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Fetch daemon health. */
export function fetchHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health');
}

/** Fetch the todo list. */
export function fetchTodos(): Promise<Todo[]> {
  return get<{ todos: Todo[] }>('/todos').then((body) => body['todos']);
}

/** Fetch todos for a status filter. */
export function fetchTodosByStatus(status: TodoStatus): Promise<Todo[]> {
  return get<{ todos: Todo[] }>(`/todos?status=${status}`).then((body) => body['todos']);
}

/** Fetch the directive inbox. */
export function fetchDirectives(): Promise<Directive[]> {
  return get<{ directives: Directive[] }>('/directives').then((body) => body['directives']);
}

/** Fetch live workers. */
export function fetchWorkers(): Promise<WorkerInfo[]> {
  return get<{ workers: WorkerInfo[] }>('/workers').then((body) => body['workers']);
}

/** Submit a directive — the CEO's only job. */
export async function submitDirective(text: string): Promise<Directive> {
  const response = await fetch(`${BASE}/directives`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `directive rejected: ${response.status}`);
  }
  const body = (await response.json()) as { directive: Directive };
  return body['directive'];
}
