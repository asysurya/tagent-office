/**
 * Path: packages/orchestrator/src/manager/simple-manager.ts
 * Purpose: SimpleManager v1 — two loops per PRD 2.13:
 *          INTAKE (event-driven): directive -> LLM breakdown -> todos,
 *          or a ClarificationSession when confidence < 0.85 (PRD 2.14).
 *          EXECUTION (interval tick): recalc priorities, auto-pass
 *          ready_for_test todos (Phase 1 policy until QA lands in Phase 6),
 *          complete directives into iterations, drive the pool watchdog.
 *          The Manager never codes — it only orchestrates.
 * Dependencies: ../store/sqlite-store, ../todo/queue, ../todo/priority,
 *              ../worker/pool, ../events/bus, @tagent-office/core, shared
 */
import {
  buildManagerBreakdownSystemPrompt,
  type ChatRequest,
  type ProviderChain,
} from '@tagent-office/core';
import {
  CONFIDENCE_THRESHOLD,
  isFiniteNumber,
  isRecord,
  isStringArray,
  type Clarification,
  type ClarificationQuestion,
  type Directive,
  type IdGenerator,
  type Logger,
  type TagentError,
  type Todo,
  type TodoDraft,
} from '@tagent-office/shared';
import { ok, type Result } from '@tagent-office/shared';
import type { EventBus } from '../events/bus';
import type { SqliteStore } from '../store/sqlite-store';
import { categoryForPriority, computePriority } from '../todo/priority';
import type { TaskQueue } from '../todo/queue';
import type { WorkerPool } from '../worker/pool';

/** Constructor deps. */
export interface SimpleManagerDeps {
  store: SqliteStore;
  queue: TaskQueue;
  bus: EventBus;
  pool: WorkerPool;
  logger?: Logger;
  /** Manager role provider chain (breakdown calls). */
  chain: ProviderChain;
  ids: IdGenerator;
  confidenceThreshold?: number;
  /** Phase 1: pass ready_for_test todos automatically (no QA workers yet). */
  qaAutoPass?: boolean;
  tickIntervalMs?: number;
}

const TODO_TYPES = ['feature', 'bug', 'refactor', 'chore', 'investigate', 'test'] as const;
const TODO_ROLES = ['frontend', 'backend', 'qa', 'any'] as const;
const TODO_CATEGORIES = ['critical', 'high', 'normal', 'low'] as const;

const DEFAULT_CLARIFICATION_QUESTIONS: ClarificationQuestion[] = [
  {
    id: 'q1',
    type: 'free_text',
    question: 'What is the single most important outcome for this directive?',
  },
  {
    id: 'q2',
    type: 'single_choice',
    question: 'Should this be built inside the current workspace only?',
    options: ['yes — stay in the workspace', 'no — needs something else'],
  },
  {
    id: 'q3',
    type: 'long_text',
    question: 'Any constraints, style, or details I should respect? (optional note)',
  },
];

/** Manager v1: intake + execution. */
export class SimpleManager {
  private readonly confidenceThreshold: number;
  private readonly qaAutoPass: boolean;
  private readonly tickIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(private readonly deps: SimpleManagerDeps) {
    this.confidenceThreshold = deps.confidenceThreshold ?? CONFIDENCE_THRESHOLD;
    this.qaAutoPass = deps.qaAutoPass ?? true;
    this.tickIntervalMs = deps.tickIntervalMs ?? 1_000;
  }

  // ------------------------------------------------------------- INTAKE LOOP

  /** Receive a user directive: breakdown or clarification (PRD 2.13). */
  async receiveDirective(text: string): Promise<Result<Directive, TagentError>> {
    const directive: Directive = {
      id: this.deps.ids.next('dir'),
      text,
      priority: 60,
      status: 'queued',
      clarificationId: null,
      createdAt: Date.now(),
      completedAt: null,
    };
    this.deps.store.insertDirective(directive);
    this.deps.bus.emit('office:directive.received', { directive });

    const request: ChatRequest = {
      messages: [
        { role: 'system', content: buildManagerBreakdownSystemPrompt() },
        { role: 'user', content: text },
      ],
    };
    const response = await this.deps.chain.chat(request);
    if (!response.ok) {
      this.deps.logger?.error('breakdown provider failed', {
        directiveId: directive.id,
        error: response.error.message,
      });
      return ok(directive); // recorded, stays queued; retried/clarified in Phase 4
    }

    const parsed = parseBreakdown(response.value.content);
    if (parsed === null) {
      this.deps.logger?.warn('breakdown response unparseable', { directiveId: directive.id });
      return ok(directive);
    }

    if (parsed.confidence < this.confidenceThreshold || parsed.todos.length === 0) {
      return this.createClarification(directive, parsed.confidence);
    }

    const todos = this.insertTodos(directive, parsed.todos);
    this.deps.store.updateDirective(directive.id, { status: 'queued' });
    this.deps.bus.emit('office:directive.queued', { directive });
    this.deps.bus.emit('office:task.fanout', {
      directiveId: directive.id,
      todoIds: todos.map((todo) => todo.id),
    });
    this.deps.logger?.info('directive broken down', {
      directiveId: directive.id,
      todos: todos.length,
      confidence: parsed.confidence,
    });
    return ok(directive);
  }

  /** Low confidence path: create a clarification session (PRD 2.14). */
  private createClarification(directive: Directive, confidence: number): Result<Directive, TagentError> {
    const clarification: Clarification = {
      id: this.deps.ids.next('clar'),
      directiveId: directive.id,
      status: 'pending',
      context: `The Manager is not confident enough (confidence ${confidence.toFixed(2)} < ${this.confidenceThreshold}). Please clarify.`,
      questions: DEFAULT_CLARIFICATION_QUESTIONS.slice(0, 7),
      answers: null,
      note: null,
      resolution: null,
      createdAt: Date.now(),
      answeredAt: null,
    };
    this.deps.store.insertClarification(clarification);
    this.deps.store.updateDirective(directive.id, {
      status: 'pending_clarification',
      clarificationId: clarification.id,
    });
    this.deps.bus.emit('office:clarification.created', { clarification });
    return ok(directive);
  }

  /** Insert todos from validated drafts, resolving intra-breakdown deps. */
  private insertTodos(directive: Directive, drafts: TodoDraft[]): Todo[] {
    const now = Date.now();
    const titleToId = new Map<string, string>();
    const todos: Todo[] = [];

    for (const draft of drafts) {
      const id = this.deps.ids.next('T');
      if (draft.title.length > 0) titleToId.set(draft.title, id);
      const priority = computePriority({
        type: draft.type,
        category: draft.category,
        blocksCount: 0,
        ageMinutes: 0,
        depsSatisfied: false,
        userBoost: false,
      });
      const todo: Todo = {
        id,
        title: draft.title,
        description: draft.description,
        type: draft.type,
        priority,
        category: categoryForPriority(priority),
        status: 'pending',
        role: draft.role,
        assignee: null,
        deps: [],
        blocks: [],
        createdBy: 'manager',
        createdIn: directive.id,
        parentDirective: directive.id,
        parentTodo: null,
        acceptance: draft.acceptance,
        testScenarios: draft.testScenarios,
        requiresQA: draft.requiresQA,
        commitHash: null,
        filesChanged: [],
        evidence: null,
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now,
      };
      this.deps.store.insertTodo(todo);
      this.deps.store.appendTodoEvent(id, 'created', { directiveId: directive.id });
      this.deps.bus.emit('office:todo.created', { todo });
      todos.push(todo);
    }

    // Resolve local deps (draft titles -> ids) in a second pass.
    for (const [index, draft] of drafts.entries()) {
      const deps = (draft.deps ?? [])
        .map((title) => titleToId.get(title))
        .filter((dep): dep is string => dep !== undefined);
      if (deps.length === 0) continue;
      const updated = this.deps.store.updateTodo(todos[index]!.id, { deps });
      todos[index] = updated;
      for (const dep of deps) {
        const blocker = this.deps.store.getTodo(dep);
        if (blocker !== null) {
          this.deps.store.updateTodo(dep, { blocks: [...blocker.blocks, todos[index]!.id] });
        }
      }
    }
    return todos;
  }

  // ---------------------------------------------------------- EXECUTION LOOP

  /** Start the execution tick. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
  }

  /** Stop the execution tick. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One execution pass (exposed for tests). */
  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return; // never overlap ticks
    this.ticking = true;
    try {
      this.deps.queue.recalcPendingPriorities(now);
      if (this.qaAutoPass) this.autoPassReadyForTest();
      this.progressDirectives();
      await this.deps.pool.checkHealth(now);
    } finally {
      this.ticking = false;
    }
  }

  /** Phase 1 QA policy: no QA workers yet, pass ready todos automatically. */
  private autoPassReadyForTest(): void {
    for (const todo of this.deps.store.listTodos({ status: ['ready_for_test'] })) {
      const updated = this.deps.store.updateTodo(todo.id, {
        status: 'done',
        evidence: { ...(todo.evidence ?? {}), qa: 'auto-passed (Phase 1 policy, QA lands in Phase 6)' },
      });
      this.deps.store.appendTodoEvent(todo.id, 'qa_auto_passed', { policy: 'phase-1' });
      this.deps.bus.emit('office:todo.done', { todo: updated });
      this.deps.logger?.info('todo auto-passed QA (Phase 1)', { todoId: todo.id });
    }
  }

  /** Move directives along: in_progress when work started, done + iteration when all terminal. */
  private progressDirectives(): void {
    for (const directive of this.deps.store.listDirectives(500)) {
      if (directive.status !== 'queued' && directive.status !== 'in_progress') continue;
      const todos = this.deps.store.listTodos({ directiveId: directive.id });
      if (todos.length === 0) continue;

      const terminal = todos.filter((todo) => todo.status === 'done' || todo.status === 'cancelled' || todo.status === 'failed');
      const failed = todos.filter((todo) => todo.status === 'failed');

      if (terminal.length === todos.length) {
        this.completeDirective(directive, todos);
        continue;
      }
      const started = todos.some((todo) => todo.status !== 'pending');
      if (started && directive.status === 'queued') {
        this.deps.store.updateDirective(directive.id, { status: 'in_progress' });
      }
      void failed;
    }
  }

  /** All todos terminal: mark the directive done and write the iteration log (PRD 2.17). */
  private completeDirective(directive: Directive, todos: Todo[]): void {
    const done = todos.filter((todo) => todo.status === 'done');
    const verdict = done.length === todos.length ? 'passed' : done.length === 0 ? 'failed' : 'partial';
    const now = Date.now();

    this.deps.store.updateDirective(directive.id, { status: 'done', completedAt: now });

    const iteration = {
      id: this.deps.ids.next('iter'),
      directiveId: directive.id,
      number: this.deps.store.countIterations() + 1,
      startedAt: directive.createdAt,
      endedAt: now,
      verdict: verdict as 'passed' | 'failed' | 'partial',
      summary: todos
        .map((todo) => `${todo.id}: ${todo.status}${todo.evidence?.['summary'] !== undefined ? ` — ${String(todo.evidence['summary'])}` : ''}`)
        .join(' | '),
      learnings: null,
      tokensInput: todos.reduce((sum, todo) => sum + readNumber(todo.evidence, 'tokens', 'input', 'inputTokens'), 0),
      tokensOutput: todos.reduce((sum, todo) => sum + readNumber(todo.evidence, 'tokens', 'output', 'outputTokens'), 0),
      cost: 0,
    };
    this.deps.store.insertIteration(iteration);
    this.deps.bus.emit('office:iteration.done', {
      iterationId: iteration.id,
      directiveId: directive.id,
      number: iteration.number,
      verdict: iteration.verdict,
      summary: iteration.summary ?? '',
    });
    const updated = this.deps.store.getDirective(directive.id) ?? directive;
    this.deps.bus.emit('office:directive.done', { directive: updated });
    this.deps.bus.emit('office:project.done', { directiveId: directive.id });
  }
}

/** Parse + validate a manager breakdown JSON payload. */
export function parseBreakdown(raw: string): { confidence: number; todos: TodoDraft[] } | null {
  const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  const candidate = first >= 0 && last > first ? stripped.slice(first, last + 1) : stripped;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!isRecord(parsed)) return null;
    const confidence = isFiniteNumber(parsed['confidence']) ? Math.max(0, Math.min(1, parsed['confidence'])) : 0;
    const rawTodos = parsed['todos'];
    if (!Array.isArray(rawTodos)) return { confidence, todos: [] };
    const todos: TodoDraft[] = [];
    for (const item of rawTodos) {
      if (!isRecord(item)) continue;
      const title = typeof item['title'] === 'string' ? item['title'] : '';
      if (title.length === 0) continue;
      todos.push({
        title,
        description: typeof item['description'] === 'string' ? item['description'] : title,
        type: TODO_TYPES.includes(item['type'] as (typeof TODO_TYPES)[number])
          ? (item['type'] as TodoDraft['type'])
          : 'feature',
        role: TODO_ROLES.includes(item['role'] as (typeof TODO_ROLES)[number])
          ? (item['role'] as TodoDraft['role'])
          : 'any',
        category: TODO_CATEGORIES.includes(item['category'] as (typeof TODO_CATEGORIES)[number])
          ? (item['category'] as TodoDraft['category'])
          : 'normal',
        acceptance: isStringArray(item['acceptance']) ? item['acceptance'] : [],
        testScenarios: isStringArray(item['testScenarios']) ? item['testScenarios'] : [],
        requiresQA: item['requiresQA'] === true,
        deps: isStringArray(item['deps']) ? item['deps'] : undefined,
      });
    }
    return { confidence, todos };
  } catch {
    return null;
  }
}

function readNumber(evidence: Record<string, unknown> | null, ...path: string[]): number {
  let current: unknown = evidence;
  for (const key of path) {
    if (!isRecord(current)) return 0;
    current = current[key];
  }
  return isFiniteNumber(current) ? current : 0;
}
