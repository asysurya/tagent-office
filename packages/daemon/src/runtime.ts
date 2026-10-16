/**
 * Path: packages/daemon/src/runtime.ts
 * Purpose: Assembles the whole office runtime from a config: storage, store,
 *          event bus + console ring, provider chains per role, worker pool
 *          with its Agent factory, and the SimpleManager. The HTTP/WS layer
 *          (server.ts, socket.ts) consumes this object.
 * Dependencies: @tagent-office/core, @tagent-office/orchestrator,
 *              @tagent-office/shared
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  Agent,
  PermissionChecker,
  buildChain,
  buildProviderRegistry,
  createBuiltinToolRegistry,
  type ProviderChain,
} from '@tagent-office/core';
import {
  EventBus,
  SimpleManager,
  SqliteStore,
  TaskQueue,
  WorkerPool,
} from '@tagent-office/orchestrator';
import {
  APP_VERSION,
  IdGenerator,
  LOG_RING_CAPACITY,
  SQLITE_DIRNAME,
  SQLITE_FILENAME,
  WORKSPACES_DIRNAME,
  createLogger,
  type EventName,
  type LogEntry,
  type LogLevel,
  type RoleName,
  type SnapshotPayload,
  type TagentConfig,
  type WorkerRole,
} from '@tagent-office/shared';

/** Bounded console ring + socket pump (owned by the runtime). */
export class ConsoleBuffer {
  private readonly entries_: LogEntry[] = [];

  constructor(private readonly capacity: number = LOG_RING_CAPACITY) {}

  push(entry: LogEntry): LogEntry {
    this.entries_.push(entry);
    if (this.entries_.length > this.capacity) this.entries_.shift();
    return entry;
  }

  entries(): LogEntry[] {
    return [...this.entries_.slice(-100)];
  }
}

/** The fully wired office. */
export interface Runtime {
  config: TagentConfig;
  workspaceRoot: string;
  store: SqliteStore;
  queue: TaskQueue;
  bus: EventBus;
  pool: WorkerPool;
  manager: SimpleManager;
  consoleBuffer: ConsoleBuffer;
  logger: ReturnType<typeof createLogger>;
  startedAt: number;
  /** Build the GUI snapshot (anti-pattern #8: sent only on request). */
  getSnapshot(): SnapshotPayload;
  /** Graceful stop of everything but the store. */
  stop(): Promise<void>;
}

/** Options for assembling a runtime. */
export interface CreateRuntimeOptions {
  config: TagentConfig;
  /** Override log level (tests use 'error' to keep output clean). */
  logLevel?: LogLevel;
}

/** Assemble the runtime from config. */
export function createRuntime(options: CreateRuntimeOptions): Runtime {
  const { config } = options;

  const storageRoot = resolve(config.storage);
  const sqliteDir = join(storageRoot, SQLITE_DIRNAME);
  const workspaceRoot = join(storageRoot, WORKSPACES_DIRNAME, config.workspace);
  mkdirSync(sqliteDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  const consoleBuffer = new ConsoleBuffer();
  const logger = createLogger({ level: options.logLevel ?? 'info' }).child({ mod: 'daemon' });

  const store = new SqliteStore({ path: join(sqliteDir, SQLITE_FILENAME) });
  const bus = new EventBus(logger);
  const queue = new TaskQueue({ store });

  // Console bridge: every office:* event becomes a console line, and every
  // console:* event (including this one) is forwarded by the socket bridge.
  // The tap skips console:* itself, so there is no feedback loop.
  bus.onAny((type, payload) => {
    if (type.startsWith('console:')) return;
    const entry = summarizeEvent(type, payload);
    if (entry !== null) {
      consoleBuffer.push(entry);
      bus.emit('console:log.append', { entry });
    }
  });

  const registryResult = buildProviderRegistry(config.providers);
  if (!registryResult.ok) throw registryResult.error;
  const registry = registryResult.value;

  const chains = new Map<RoleName, ProviderChain>();
  for (const [roleName, role] of Object.entries(config.roles) as [RoleName, (typeof config.roles)[RoleName]][]) {
    const chain = buildChain(registry, [role.primary, ...role.fallbacks], {
      onFallback: (step, error) => {
        logger.warn('provider fallback', {
          role: roleName,
          provider: step.providerId,
          model: step.model,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
    if (!chain.ok) throw chain.error;
    chains.set(roleName, chain.value);
  }

  const pool = new WorkerPool({
    store,
    queue,
    bus,
    logger,
    roles: config.performance.workerRoles.filter((role): role is WorkerRole =>
      role === 'frontend' || role === 'backend' || role === 'qa' || role === 'vision',
    ),
    maxWorkers: config.performance.maxWorkers,
    agentFactory: ({ id, role }) =>
      new Agent({
        workerId: id,
        role,
        chain: chains.get(role === 'vision' ? 'vision' : role) ?? chains.get('frontend')!,
        tools: createBuiltinToolRegistry({
          checker: new PermissionChecker(config.permissions),
          logger: logger.child({ workerId: id }),
        }),
        workspaceRoot,
      }),
  });

  const manager = new SimpleManager({
    store,
    queue,
    bus,
    pool,
    logger,
    chain: chains.get('manager')!,
    ids: new IdGenerator((prefix) => store.maxSeq(prefix)),
  });

  const startedAt = Date.now();
  return {
    config,
    workspaceRoot,
    store,
    queue,
    bus,
    pool,
    manager,
    consoleBuffer,
    logger,
    startedAt,
    getSnapshot(): SnapshotPayload {
      return {
        serverTime: Date.now(),
        version: APP_VERSION,
        directives: store.listDirectives(100),
        todos: store.listTodos(),
        workers: store.listWorkers(),
        logs: consoleBuffer.entries(),
      };
    },
    async stop(): Promise<void> {
      manager.stop();
      await pool.stopAll();
    },
  };
}

/** Turn a bus event into a human-readable console line. */
function summarizeEvent(type: EventName, payload: unknown): LogEntry | null {
  const record = payload as Record<string, unknown>;
  const base = { ts: Date.now(), source: 'office' };
  switch (type) {
    case 'office:directive.received':
      return { ...base, level: 'info', source: 'manager', message: `Directive received: ${String(record['directive'] !== undefined ? (record['directive'] as { text: string }).text : '')}`.slice(0, 200) };
    case 'office:directive.queued':
      return { ...base, level: 'info', source: 'manager', message: 'Directive queued — todos dispatched' };
    case 'office:directive.done':
      return { ...base, level: 'info', source: 'manager', message: 'Directive done — iteration logged' };
    case 'office:clarification.created':
      return { ...base, level: 'warn', source: 'manager', message: 'Clarification needed (confidence below threshold)' };
    case 'office:todo.created':
      return { ...base, level: 'info', source: 'manager', message: `Todo created: ${todoTitle(record)}` };
    case 'office:todo.assigned':
      return { ...base, level: 'info', source: 'queue', message: `Todo assigned: ${todoTitle(record)} -> ${String(record['workerId'] ?? '?')}` };
    case 'office:todo.done':
      return { ...base, level: 'info', source: 'office', message: `Todo done: ${todoTitle(record)}` };
    case 'office:todo.failed':
      return { ...base, level: 'error', source: 'office', message: `Todo failed: ${todoTitle(record)} — ${String(record['reason'] ?? '')}`.slice(0, 200) };
    case 'office:todo.ready':
      return { ...base, level: 'info', source: 'office', message: `Todo ready for test: ${todoTitle(record)}` };
    case 'office:agent.progress':
      return { ...base, level: 'debug', source: `agent:${String(record['workerId'] ?? '?')}`, message: `[step ${String(record['step'])}] ${String(record['thought'] ?? '')}`.slice(0, 200) };
    case 'office:agent.tool_call':
      return { ...base, level: 'info', source: `agent:${String(record['workerId'] ?? '?')}`, message: `tool call: ${String(record['tool'])}` };
    case 'office:agent.tool_result':
      return { ...base, level: record['ok'] === true ? 'info' : 'warn', source: `agent:${String(record['workerId'] ?? '?')}`, message: `tool result: ${String(record['tool'])} -> ${String(record['summary'] ?? '').slice(0, 120)}` };
    case 'office:agent.task_done':
      return { ...base, level: 'info', source: `agent:${String(record['workerId'] ?? '?')}`, message: `task done: ${String(record['summary'] ?? '')}`.slice(0, 200) };
    case 'office:worker.spawned':
      return { ...base, level: 'info', source: 'pool', message: `Worker spawned: ${String(record['workerId'])} (${String(record['role'])})` };
    case 'office:worker.idle':
      return { ...base, level: 'debug', source: 'pool', message: `Worker idle: ${String(record['workerId'])}` };
    case 'office:worker.dead':
      return { ...base, level: 'error', source: 'pool', message: `Worker dead: ${String(record['workerId'])} — restarting` };
    case 'office:iteration.done':
      return { ...base, level: 'info', source: 'manager', message: `Iteration #${String(record['number'])} ${String(record['verdict'])}` };
    default:
      return null; // source:*, preview:* arrive in their phases
  }
}

function todoTitle(record: Record<string, unknown>): string {
  const todo = record['todo'] as { id?: string; title?: string } | undefined;
  return `${todo?.id ?? '?'} ${todo?.title ?? ''}`.trim();
}
