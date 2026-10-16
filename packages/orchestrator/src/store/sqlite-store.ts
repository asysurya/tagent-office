/**
 * Path: packages/orchestrator/src/store/sqlite-store.ts
 * Purpose: SQLite persistence on bun:sqlite. WAL mode, POSITIONAL `?`
 *          parameters everywhere (anti-pattern #3), column `commit_hash`
 *          (anti-pattern #2). Arrays/objects are JSON text; rows map to
 *          domain types through guarded converters.
 * Dependencies: bun:sqlite, ./migrations, @tagent-office/shared
 */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import {
  isRecord,
  isStringArray,
  NotFoundError,
  type Clarification,
  type ClarificationQuestion,
  type Directive,
  type DirectiveStatus,
  type Iteration,
  type Todo,
  type TodoFilters,
  type TodoStatus,
  type WorkerInfo,
  type WorkerRole,
  type WorkerState,
} from '@tagent-office/shared';
import { MIGRATIONS, SCHEMA_VERSION } from './migrations';

/** Options for opening a store. */
export interface SqliteStoreOptions {
  /** File path or ':memory:'. */
  path: string;
}

interface TodoRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: number;
  category: string;
  status: string;
  role: string | null;
  assignee: string | null;
  deps: string | null;
  blocks: string | null;
  created_by: string | null;
  created_in: string | null;
  parent_directive: string | null;
  parent_todo: string | null;
  acceptance: string | null;
  test_scenarios: string | null;
  requires_qa: number | null;
  commit_hash: string | null;
  files_changed: string | null;
  evidence: string | null;
  attempts: number | null;
  max_attempts: number | null;
  created_at: number | null;
  updated_at: number | null;
}

function parseJsonArray(value: string | null): string[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return isStringArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    type: row.type as Todo['type'],
    priority: row.priority,
    category: row.category as Todo['category'],
    status: row.status as TodoStatus,
    role: (row.role ?? 'any') as Todo['role'],
    assignee: row.assignee,
    deps: parseJsonArray(row.deps),
    blocks: parseJsonArray(row.blocks),
    createdBy: (row.created_by ?? 'manager') as Todo['createdBy'],
    createdIn: row.created_in ?? '',
    parentDirective: row.parent_directive ?? '',
    parentTodo: row.parent_todo,
    acceptance: parseJsonArray(row.acceptance),
    testScenarios: parseJsonArray(row.test_scenarios),
    requiresQA: (row.requires_qa ?? 0) === 1,
    commitHash: row.commit_hash,
    filesChanged: parseJsonArray(row.files_changed),
    evidence: parseJsonRecord(row.evidence),
    attempts: row.attempts ?? 0,
    maxAttempts: row.max_attempts ?? 3,
    createdAt: row.created_at ?? 0,
    updatedAt: row.updated_at ?? 0,
  };
}

/** All persistence for the office. One instance per process. */
export class SqliteStore {
  private readonly db: Database;

  constructor(options: SqliteStoreOptions) {
    this.db = new Database(options.path, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  /** Close the database. */
  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const current = this.db.query('PRAGMA user_version').get() as { user_version: number } | null;
    if ((current?.user_version ?? 0) >= SCHEMA_VERSION) return;
    for (const statement of MIGRATIONS) {
      this.db.exec(statement);
    }
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  // ------------------------------------------------------------------ todos

  /** Insert a full todo row. */
  insertTodo(todo: Todo): void {
    this.db
      .query(
        `INSERT INTO todos (
          id, title, description, type, priority, category, status, role, assignee,
          deps, blocks, created_by, created_in, parent_directive, parent_todo,
          acceptance, test_scenarios, requires_qa, commit_hash, files_changed, evidence,
          attempts, max_attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        todo.id,
        todo.title,
        todo.description,
        todo.type,
        todo.priority,
        todo.category,
        todo.status,
        todo.role,
        todo.assignee,
        JSON.stringify(todo.deps),
        JSON.stringify(todo.blocks),
        todo.createdBy,
        todo.createdIn,
        todo.parentDirective,
        todo.parentTodo,
        JSON.stringify(todo.acceptance),
        JSON.stringify(todo.testScenarios),
        todo.requiresQA ? 1 : 0,
        todo.commitHash,
        JSON.stringify(todo.filesChanged),
        todo.evidence === null ? null : JSON.stringify(todo.evidence),
        todo.attempts,
        todo.maxAttempts,
        todo.createdAt,
        todo.updatedAt,
      );
  }

  /** Fetch one todo. */
  getTodo(id: string): Todo | null {
    const row = this.db.query('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | null;
    return row === null ? null : rowToTodo(row);
  }

  /** Fetch one todo or throw NotFoundError. */
  requireTodo(id: string): Todo {
    const todo = this.getTodo(id);
    if (todo === null) throw new NotFoundError('Todo', id);
    return todo;
  }

  /** List todos with optional filters. */
  listTodos(filters: TodoFilters = {}): Todo[] {
    const where: string[] = [];
    const params: SQLQueryBindings[] = [];
    if (filters.status !== undefined && filters.status.length > 0) {
      where.push(`status IN (${filters.status.map(() => '?').join(', ')})`);
      params.push(...filters.status);
    }
    if (filters.role !== undefined) {
      where.push('(role = ? OR role = ?)');
      params.push(filters.role, 'any');
    }
    if (filters.directiveId !== undefined) {
      where.push('parent_directive = ?');
      params.push(filters.directiveId);
    }
    const sql = `SELECT * FROM todos ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY priority DESC, created_at ASC`;
    const rows = this.db.query(sql).all(...params) as TodoRow[];
    return rows.map(rowToTodo);
  }

  /** Patch selected columns; updated_at is always refreshed. */
  updateTodo(id: string, patch: Partial<Todo>): Todo {
    const sets: string[] = [];
    const params: SQLQueryBindings[] = [];
    const columnMap: Array<[keyof Todo, string]> = [
      ['title', 'title'],
      ['description', 'description'],
      ['type', 'type'],
      ['priority', 'priority'],
      ['category', 'category'],
      ['status', 'status'],
      ['role', 'role'],
      ['assignee', 'assignee'],
      ['commitHash', 'commit_hash'],
      ['attempts', 'attempts'],
      ['parentTodo', 'parent_todo'],
    ];
    for (const [field, column] of columnMap) {
      const value = patch[field];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        // Every column in columnMap is scalar (string | number | null).
        params.push(value as SQLQueryBindings);
      }
    }
    if (patch.deps !== undefined) {
      sets.push('deps = ?');
      params.push(JSON.stringify(patch.deps));
    }
    if (patch.blocks !== undefined) {
      sets.push('blocks = ?');
      params.push(JSON.stringify(patch.blocks));
    }
    if (patch.acceptance !== undefined) {
      sets.push('acceptance = ?');
      params.push(JSON.stringify(patch.acceptance));
    }
    if (patch.testScenarios !== undefined) {
      sets.push('test_scenarios = ?');
      params.push(JSON.stringify(patch.testScenarios));
    }
    if (patch.filesChanged !== undefined) {
      sets.push('files_changed = ?');
      params.push(JSON.stringify(patch.filesChanged));
    }
    if (patch.evidence !== undefined) {
      sets.push('evidence = ?');
      params.push(patch.evidence === null ? null : JSON.stringify(patch.evidence));
    }
    if (patch.requiresQA !== undefined) {
      sets.push('requires_qa = ?');
      params.push(patch.requiresQA ? 1 : 0);
    }
    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);
    this.db.query(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.requireTodo(id);
  }

  /** Todos that list `id` in their deps. */
  dependentsOf(id: string): Todo[] {
    const rows = this.db.query('SELECT * FROM todos').all() as TodoRow[];
    return rows.map(rowToTodo).filter((todo) => todo.deps.includes(id));
  }

  /** Statuses of the given todo ids. */
  statusesOf(ids: string[]): Map<string, TodoStatus> {
    const map = new Map<string, TodoStatus>();
    if (ids.length === 0) return map;
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .query(`SELECT id, status FROM todos WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{ id: string; status: string }>;
    for (const row of rows) map.set(row.id, row.status as TodoStatus);
    return map;
  }

  /**
   * Atomically claim the highest-priority eligible todo for a worker.
   * Deps must all be 'done'; the claim is a conditional UPDATE so two
   * workers can never grab the same todo (anti-pattern #4/#6 safe).
   */
  claimNextTodo(workerId: string, role: WorkerRole): Todo | null {
    const rows = this.db
      .query(
        `SELECT * FROM todos WHERE status = 'pending' AND (role = ? OR role = 'any' OR ? = 'any')
         ORDER BY priority DESC, created_at ASC LIMIT 50`,
      )
      .all(role, role) as TodoRow[];
    for (const row of rows) {
      const todo = rowToTodo(row);
      if (todo.deps.length > 0) {
        const statuses = this.statusesOf(todo.deps);
        const allDone = todo.deps.every((dep) => statuses.get(dep) === 'done');
        if (!allDone) continue;
      }
      const claim = this.db
        .query(`UPDATE todos SET status = 'assigned', assignee = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
        .run(workerId, Date.now(), todo.id);
      if (claim.changes === 1) {
        return this.requireTodo(todo.id);
      }
      // Raced by another worker — try the next candidate.
    }
    return null;
  }

  /** Todos assigned to a worker that are not in a terminal state. */
  activeTodosOf(workerId: string): Todo[] {
    const rows = this.db
      .query(`SELECT * FROM todos WHERE assignee = ? AND status IN ('assigned', 'in_progress')`)
      .all(workerId) as TodoRow[];
    return rows.map(rowToTodo);
  }

  // ------------------------------------------------------------ todo events

  /** Append a typed todo event (audit trail). */
  appendTodoEvent(todoId: string, eventType: string, payload: Record<string, unknown>): void {
    this.db
      .query('INSERT INTO todo_events (todo_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?)')
      .run(todoId, eventType, JSON.stringify(payload), Date.now());
  }

  /** Recent events for a todo (newest last). */
  listTodoEvents(todoId: string, limit = 100): Array<{ id: number; todoId: string; eventType: string; payload: Record<string, unknown> | null; timestamp: number }> {
    const rows = this.db
      .query('SELECT * FROM todo_events WHERE todo_id = ? ORDER BY id ASC LIMIT ?')
      .all(todoId, limit) as Array<{ id: number; todo_id: string; event_type: string; payload: string | null; timestamp: number }>;
    return rows.map((row) => ({
      id: row.id,
      todoId: row.todo_id,
      eventType: row.event_type,
      payload: parseJsonRecord(row.payload),
      timestamp: row.timestamp,
    }));
  }

  // ------------------------------------------------------------ directives

  /** Insert a directive. */
  insertDirective(directive: Directive): void {
    this.db
      .query(
        'INSERT INTO directives (id, text, priority, status, clarification_id, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        directive.id,
        directive.text,
        directive.priority,
        directive.status,
        directive.clarificationId,
        directive.createdAt,
        directive.completedAt,
      );
  }

  /** Fetch one directive. */
  getDirective(id: string): Directive | null {
    const row = this.db.query('SELECT * FROM directives WHERE id = ?').get(id) as
      | { id: string; text: string; priority: number; status: string; clarification_id: string | null; created_at: number | null; completed_at: number | null }
      | null;
    if (row === null) return null;
    return {
      id: row.id,
      text: row.text,
      priority: row.priority,
      status: row.status as DirectiveStatus,
      clarificationId: row.clarification_id,
      createdAt: row.created_at ?? 0,
      completedAt: row.completed_at,
    };
  }

  /** List directives (newest first). */
  listDirectives(limit = 100): Directive[] {
    const rows = this.db
      .query('SELECT * FROM directives ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{ id: string; text: string; priority: number; status: string; clarification_id: string | null; created_at: number | null; completed_at: number | null }>;
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      priority: row.priority,
      status: row.status as DirectiveStatus,
      clarificationId: row.clarification_id,
      createdAt: row.created_at ?? 0,
      completedAt: row.completed_at,
    }));
  }

  /** Patch a directive's mutable fields. */
  updateDirective(id: string, patch: Partial<Pick<Directive, 'status' | 'clarificationId' | 'completedAt' | 'priority'>>): void {
    const sets: string[] = [];
    const params: SQLQueryBindings[] = [];
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.clarificationId !== undefined) {
      sets.push('clarification_id = ?');
      params.push(patch.clarificationId);
    }
    if (patch.completedAt !== undefined) {
      sets.push('completed_at = ?');
      params.push(patch.completedAt);
    }
    if (patch.priority !== undefined) {
      sets.push('priority = ?');
      params.push(patch.priority);
    }
    if (sets.length === 0) return;
    params.push(id);
    this.db.query(`UPDATE directives SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  // ------------------------------------------------------------ iterations

  /** Insert an iteration record. */
  insertIteration(iteration: Iteration): void {
    this.db
      .query(
        'INSERT INTO iterations (id, directive_id, number, started_at, ended_at, verdict, summary, learnings, tokens_input, tokens_output, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        iteration.id,
        iteration.directiveId,
        iteration.number,
        iteration.startedAt,
        iteration.endedAt,
        iteration.verdict,
        iteration.summary,
        iteration.learnings,
        iteration.tokensInput,
        iteration.tokensOutput,
        iteration.cost,
      );
  }

  /** Count iterations (for the next iteration number). */
  countIterations(): number {
    const row = this.db.query('SELECT COUNT(*) AS n FROM iterations').get() as { n: number } | null;
    return row?.n ?? 0;
  }

  // ------------------------------------------------------------ clarifications

  /** Insert a clarification session. */
  insertClarification(clarification: Clarification): void {
    this.db
      .query(
        'INSERT INTO clarifications (id, directive_id, status, context, questions, answers, note, resolution, created_at, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        clarification.id,
        clarification.directiveId,
        clarification.status,
        clarification.context,
        JSON.stringify(clarification.questions),
        clarification.answers === null ? null : JSON.stringify(clarification.answers),
        clarification.note,
        clarification.resolution,
        clarification.createdAt,
        clarification.answeredAt,
      );
  }

  /** Fetch a clarification. */
  getClarification(id: string): Clarification | null {
    const row = this.db.query('SELECT * FROM clarifications WHERE id = ?').get(id) as
      | { id: string; directive_id: string; status: string; context: string; questions: string; answers: string | null; note: string | null; resolution: string | null; created_at: number | null; answered_at: number | null }
      | null;
    if (row === null) return null;
    return {
      id: row.id,
      directiveId: row.directive_id,
      status: row.status as Clarification['status'],
      context: row.context,
      questions: parseQuestions(row.questions),
      answers: parseJsonRecord(row.answers),
      note: row.note,
      resolution: row.resolution,
      createdAt: row.created_at ?? 0,
      answeredAt: row.answered_at,
    };
  }

  /** List pending clarifications. */
  listClarifications(status?: string): Clarification[] {
    const rows = (status === undefined
      ? this.db.query('SELECT * FROM clarifications').all()
      : this.db.query('SELECT * FROM clarifications WHERE status = ?').all(status)) as Array<{
      id: string;
      directive_id: string;
      status: string;
      context: string;
      questions: string;
      answers: string | null;
      note: string | null;
      resolution: string | null;
      created_at: number | null;
      answered_at: number | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      directiveId: row.directive_id,
      status: row.status as Clarification['status'],
      context: row.context,
      questions: parseQuestions(row.questions),
      answers: parseJsonRecord(row.answers),
      note: row.note,
      resolution: row.resolution,
      createdAt: row.created_at ?? 0,
      answeredAt: row.answered_at,
    }));
  }

  /** Update a clarification. */
  updateClarification(id: string, patch: Partial<Pick<Clarification, 'status' | 'answers' | 'note' | 'resolution' | 'answeredAt'>>): void {
    const sets: string[] = [];
    const params: SQLQueryBindings[] = [];
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.answers !== undefined) {
      sets.push('answers = ?');
      params.push(patch.answers === null ? null : JSON.stringify(patch.answers));
    }
    if (patch.note !== undefined) {
      sets.push('note = ?');
      params.push(patch.note);
    }
    if (patch.resolution !== undefined) {
      sets.push('resolution = ?');
      params.push(patch.resolution);
    }
    if (patch.answeredAt !== undefined) {
      sets.push('answered_at = ?');
      params.push(patch.answeredAt);
    }
    if (sets.length === 0) return;
    params.push(id);
    this.db.query(`UPDATE clarifications SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  // ------------------------------------------------------------ workers

  /** Upsert a worker row. */
  upsertWorker(worker: WorkerInfo): void {
    this.db
      .query(
        `INSERT INTO workers (id, role, state, current_todo_id, current_todo_state, config, started_at, last_heartbeat)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           role = excluded.role,
           state = excluded.state,
           current_todo_id = excluded.current_todo_id,
           current_todo_state = excluded.current_todo_state,
           started_at = excluded.started_at,
           last_heartbeat = excluded.last_heartbeat`,
      )
      .run(worker.id, worker.role, worker.state, worker.currentTodoId, worker.currentTodoState, worker.startedAt, worker.lastHeartbeat);
  }

  /** Fetch a worker. */
  getWorker(id: string): WorkerInfo | null {
    const row = this.db.query('SELECT * FROM workers WHERE id = ?').get(id) as
      | { id: string; role: string; state: string; current_todo_id: string | null; current_todo_state: string | null; started_at: number | null; last_heartbeat: number | null }
      | null;
    if (row === null) return null;
    return rowToWorker(row);
  }

  /** List workers. */
  listWorkers(): WorkerInfo[] {
    const rows = this.db.query('SELECT * FROM workers').all() as Array<{
      id: string;
      role: string;
      state: string;
      current_todo_id: string | null;
      current_todo_state: string | null;
      started_at: number | null;
      last_heartbeat: number | null;
    }>;
    return rows.map(rowToWorker);
  }

  /** Patch a worker's mutable fields. */
  updateWorker(id: string, patch: Partial<Pick<WorkerInfo, 'state' | 'currentTodoId' | 'currentTodoState' | 'lastHeartbeat'>>): void {
    const sets: string[] = [];
    const params: SQLQueryBindings[] = [];
    if (patch.state !== undefined) {
      sets.push('state = ?');
      params.push(patch.state);
    }
    if (patch.currentTodoId !== undefined) {
      sets.push('current_todo_id = ?');
      params.push(patch.currentTodoId);
    }
    if (patch.currentTodoState !== undefined) {
      sets.push('current_todo_state = ?');
      params.push(patch.currentTodoState);
    }
    if (patch.lastHeartbeat !== undefined) {
      sets.push('last_heartbeat = ?');
      params.push(patch.lastHeartbeat);
    }
    if (sets.length === 0) return;
    params.push(id);
    this.db.query(`UPDATE workers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  /** Highest sequence number used by an id prefix, routed per table (seeding). */
  maxSeq(prefix: string): number {
    const table =
      prefix === 'T' ? 'todos'
      : prefix === 'dir' ? 'directives'
      : prefix === 'iter' ? 'iterations'
      : prefix === 'clar' ? 'clarifications'
      : 'workers';
    const rows = this.db.query(`SELECT id FROM ${table}`).all() as Array<{ id: string }>;
    let max = 0;
    for (const row of rows) {
      if (row.id.startsWith(`${prefix}-`)) {
        const suffix = Number.parseInt(row.id.slice(prefix.length + 1), 10);
        if (Number.isFinite(suffix) && suffix > max) max = suffix;
      }
    }
    return max;
  }

  // ------------------------------------------------------------ memories (stub-level, Phase 7)

  /** Insert a memory row (schema present now; logic lands in Phase 7). */
  insertMemory(memory: { id: string; type: string; scope: string; agentId: string | null; content: string; importance: number }): void {
    this.db
      .query(
        'INSERT INTO memories (id, type, scope, agent_id, content, embedding, importance, tags, recall_count, last_recalled_at, superseded_by, ttl, created_at, source) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 0, NULL, NULL, NULL, ?, ?)',
      )
      .run(memory.id, memory.type, memory.scope, memory.agentId, memory.content, memory.importance, Date.now(), 'system');
  }
}

function rowToWorker(row: {
  id: string;
  role: string;
  state: string;
  current_todo_id: string | null;
  current_todo_state: string | null;
  started_at: number | null;
  last_heartbeat: number | null;
}): WorkerInfo {
  return {
    id: row.id,
    role: row.role as WorkerRole,
    state: row.state as WorkerState,
    currentTodoId: row.current_todo_id,
    currentTodoState: row.current_todo_state,
    startedAt: row.started_at ?? 0,
    lastHeartbeat: row.last_heartbeat ?? 0,
  };
}

function parseQuestions(value: string | null): ClarificationQuestion[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ClarificationQuestion =>
        isRecord(item) && typeof item['id'] === 'string' && typeof item['question'] === 'string',
    );
  } catch {
    return [];
  }
}
