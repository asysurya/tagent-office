# @tagent-office/orchestrator

The office brain and muscle: SQLite persistence, the priority task queue, the worker pool, and the SimpleManager.

- **`SqliteStore`** (`src/store`) — bun:sqlite, WAL mode, the exact PRD 2.25 schema (column `commit_hash`, positional `?` args only). Todos, todo events, directives, iterations, clarifications, workers, memories.
- **`TaskQueue`** (`src/todo`) — PRD 2.11 priority model (base per type, category bands, blocks/aging/deps-satisfied/bug modifiers, cap 100) + atomic claims: two workers can never take the same todo.
- **`WorkerPool` + `Worker`** (`src/worker`) — spawn N workers per role, infinite pull loop, 5s heartbeats, watchdog restart after 15s silence, in-flight todos requeued on boot (resume-safe).
- **`SimpleManager`** (`src/manager`) — dual loop per PRD 2.13: intake (directive → LLM breakdown → todos, or Clarification below 0.85 confidence) and execution (priority recalc, Phase 1 QA auto-pass, directive completion into iteration logs, pool watchdog).
- **`EventBus`** (`src/events`) — typed pub/sub over the PRD 2.26 event namespaces.

## Usage

```ts
import { EventBus, SimpleManager, SqliteStore, TaskQueue, WorkerPool } from '@tagent-office/orchestrator';
```

## Test

```bash
bun test   # repo root
```
