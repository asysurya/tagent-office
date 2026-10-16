/**
 * Path: packages/orchestrator/src/index.ts
 * Purpose: Public barrel for @tagent-office/orchestrator.
 * Dependencies: all sibling modules
 */
export { EventBus, type AnyHandler } from './events/bus';
export { SimpleManager, parseBreakdown, type SimpleManagerDeps } from './manager/simple-manager';
export { SCHEMA_VERSION, MIGRATIONS } from './store/migrations';
export { SqliteStore, type SqliteStoreOptions } from './store/sqlite-store';
export { categoryForPriority, computePriority, priorityInputForTodo, type PriorityInput } from './todo/priority';
export { TaskQueue, type TaskQueueOptions } from './todo/queue';
export { Worker, type WorkerDeps } from './worker/worker';
export { WorkerPool, type WorkerPoolDeps } from './worker/pool';
