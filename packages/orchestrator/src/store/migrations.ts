/**
 * Path: packages/orchestrator/src/store/migrations.ts
 * Purpose: SQLite DDL exactly per PRD 2.25. Notes:
 *          - the column is `commit_hash`, NEVER `commit` (reserved keyword)
 *          - arrays/objects are stored as JSON text
 *          - schema versioning via PRAGMA user_version (boring and reliable)
 * Dependencies: none
 */

/** Bump when the schema evolves; keep old migrations append-only. */
export const SCHEMA_VERSION = 1;

/** Full schema, idempotent. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 60,
    category TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'pending',
    role TEXT,
    assignee TEXT,
    deps TEXT,
    blocks TEXT,
    created_by TEXT,
    created_in TEXT,
    parent_directive TEXT,
    parent_todo TEXT,
    acceptance TEXT,
    test_scenarios TEXT,
    requires_qa INTEGER DEFAULT 1,
    commit_hash TEXT,
    files_changed TEXT,
    evidence TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at INTEGER,
    updated_at INTEGER
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);`,
  `CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_todos_assignee ON todos(assignee);`,
  `
  CREATE TABLE IF NOT EXISTS todo_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT,
    timestamp INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS directives (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    priority INTEGER DEFAULT 60,
    status TEXT DEFAULT 'pending_clarification',
    clarification_id TEXT,
    created_at INTEGER,
    completed_at INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS iterations (
    id TEXT PRIMARY KEY,
    directive_id TEXT,
    number INTEGER,
    started_at INTEGER,
    ended_at INTEGER,
    verdict TEXT,
    summary TEXT,
    learnings TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost REAL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS clarifications (
    id TEXT PRIMARY KEY,
    directive_id TEXT,
    status TEXT DEFAULT 'pending',
    context TEXT,
    questions TEXT,
    answers TEXT,
    note TEXT,
    resolution TEXT,
    created_at INTEGER,
    answered_at INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    state TEXT NOT NULL,
    current_todo_id TEXT,
    current_todo_state TEXT,
    config TEXT,
    started_at INTEGER,
    last_heartbeat INTEGER
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    scope TEXT NOT NULL,
    agent_id TEXT,
    content TEXT NOT NULL,
    embedding BLOB,
    importance INTEGER DEFAULT 5,
    tags TEXT,
    recall_count INTEGER DEFAULT 0,
    last_recalled_at INTEGER,
    superseded_by TEXT,
    ttl INTEGER,
    created_at INTEGER,
    source TEXT
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope, type);`,
  `CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);`,
];
