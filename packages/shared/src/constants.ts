/**
 * Path: packages/shared/src/constants.ts
 * Purpose: All PRD-derived constants in one place. Single source of truth so
 *          the daemon, orchestrator, and GUI never disagree on numbers.
 * Dependencies: none
 */

// -- Ports (PRD 2.27) -------------------------------------------------------
export const DEFAULT_PORT = 4020;
export const PREVIEW_STABLE_PORT = 4021;
export const PREVIEW_LATEST_PORT = 4022;
export const PREVIEW_LIVE_PORT_BASE = 4023;

// -- Socket ------------------------------------------------------------------
/** Standard socket.io path. NEVER the sandbox ?XTransformPort pattern. */
export const SOCKET_PATH = '/socket.io';

// -- Manager / clarification (PRD 2.14, 2.24) --------------------------------
/** Confidence below this triggers a clarification session. */
export const CONFIDENCE_THRESHOLD = 0.85;
/** Max questions per clarification session; split beyond this. */
export const MAX_CLARIFICATION_QUESTIONS = 7;
/** Max total iterations per directive (PRD 2.24 #6). */
export const MAX_ITERATIONS = 10;
/** Priority at or above this preempts workers (PRD 2.24 #4). */
export const PREEMPTION_THRESHOLD = 90;

// -- Todos / retries (PRD 2.24 #5) ---------------------------------------------
export const MAX_RETRY_PER_TODO = 3;

// -- Workers (PRD 2.12) -------------------------------------------------------
export const HEARTBEAT_INTERVAL_MS = 5_000;
/** No heartbeat for this long => Manager restarts the worker. */
export const HEARTBEAT_TIMEOUT_MS = 15_000;
/** Idle workers poll for work at this interval. */
export const WORKER_POLL_INTERVAL_MS = 500;
/** An idle worker re-asks at most every 30s (PRD 2.12). */
export const WORKER_IDLE_MAX_WAIT_MS = 30_000;

// -- Performance (PRD 2.22, 2.24) ----------------------------------------------
export const DEFAULT_MAX_WORKERS = 4;
export const DEFAULT_MAX_QA = 2;
export const DEFAULT_WORKER_ROLES: readonly string[] = ['frontend', 'backend'];

// -- Priority model (PRD 2.11) ---------------------------------------------------
export const PRIORITY_CAP = 100;
export const PRIORITY_FLOOR = 0;

/** Category bands. */
export const CATEGORY_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  critical: [90, 100],
  high: [70, 89],
  normal: [40, 69],
  low: [0, 39],
};

/** Base priority per todo type. */
export const DEFAULT_PRIORITY_BY_TYPE: Readonly<Record<string, number>> = {
  feature: 60,
  bug: 70,
  refactor: 40,
  chore: 30,
  investigate: 50,
  test: 50,
};

/** Priority modifiers. */
export const PRIORITY_MODIFIER: Readonly<Record<string, number>> = {
  BLOCKS_MANY: 20, // blocks >= 3 todos
  BLOCKS_SOME: 10, // blocks 1-2 todos
  AGING_PER_MINUTE: 2,
  AGING_MAX: 20,
  DEPS_SATISFIED: 15,
  USER_BOOST: 30,
  BUG: 10,
  REGRESSION: 15,
};

// -- Agent loop -----------------------------------------------------------------
export const MAX_STEPS_PER_RUN = 15;
/** Malformed responses before a provider fallback is triggered. */
export const MAX_MALFORMED_RESPONSES = 3;

// -- Tools -----------------------------------------------------------------------
export const BASH_TIMEOUT_MS = 30_000;
export const MAX_FILE_READ_BYTES = 1_048_576; // 1 MiB
export const MAX_TOOL_OUTPUT_CHARS = 8_000;

// -- Console / snapshot ------------------------------------------------------------
export const LOG_RING_CAPACITY = 500;

// -- Storage layout ----------------------------------------------------------------
export const DEFAULT_STORAGE_DIR = './storage';
export const DEFAULT_WORKSPACE_NAME = 'demo';
export const SQLITE_DIRNAME = 'sqlite';
export const WORKSPACES_DIRNAME = 'workspaces';
export const SQLITE_FILENAME = 'tagent.db';

// -- Misc -----------------------------------------------------------------------------
export const APP_NAME = 'tagent-office';
export const APP_VERSION = '0.1.0';
export const CONFIG_FILENAME = 'tagent-office.config.json';
