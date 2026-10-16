/**
 * Path: packages/shared/src/types/config.ts
 * Purpose: Configuration schema types (PRD 2.20, 2.21). Provider configs
 *          support a single generic openai-compatible adapter — one adapter,
 *          any provider (Groq, Ollama, OpenRouter, ...). API keys may embed
 *          "${ENV_VAR}" references resolved at load time.
 * Dependencies: none
 */

/** Supported provider adapter types. */
export type ProviderType = 'openai' | 'anthropic' | 'openai-compatible' | 'mock';

/** Optional capability hints used by fallback logic (PRD 2.15, 2.16). */
export interface ProviderCapabilities {
  vision?: boolean;
  tools?: boolean;
  streaming?: boolean;
  longContext?: boolean;
}

/** One LLM provider entry (PRD 2.20). */
export interface ProviderConfig {
  type: ProviderType;
  /** Required for openai-compatible; e.g. https://api.groq.com/openai/v1 */
  baseURL?: string;
  /** Plain key or "${ENV_VAR}" reference. Never hardcode real keys. */
  apiKey: string;
  models: string[];
  headers?: Record<string, string>;
  capabilities?: ProviderCapabilities;
}

/** Agent roles that get their own provider chain (PRD 2.15). */
export type RoleName = 'manager' | 'frontend' | 'backend' | 'qa' | 'vision';

/** Model reference format: "provider/model", e.g. "groq/llama-3.3-70b-versatile". */
export type ModelRef = string;

/** Per-role provider chain (primary + ordered fallbacks, PRD 2.15). */
export interface RoleConfig {
  primary: ModelRef;
  fallbacks: ModelRef[];
  /** Capability requirements for the role, e.g. ["tools"]. */
  requires?: string[];
}

/** Per-tool permission overrides: allow | ask | deny (PRD 2.19). */
export type ToolPermission = 'allow' | 'ask' | 'deny';

/** Permission configuration. */
export interface PermissionsConfig {
  tools: Record<string, ToolPermission>;
  /**
   * Phase 1 policy: when a tool resolves to "ask", auto-approve it and log the
   * decision (real approval queue arrives in Phase 4). Set false to hard-deny.
   */
  autoApproveAsk: boolean;
}

/** Performance tier configuration (PRD 2.22). */
export type PerformanceTier = 'auto' | 'potato' | 'low' | 'medium' | 'high' | 'ultra';

/** Performance configuration. */
export interface PerformanceConfig {
  tier: PerformanceTier;
  /** Max concurrent workers (excluding QA). */
  maxWorkers: number;
  /** Max concurrent QA workers. */
  maxQA: number;
  /** Worker roles spawned at boot (Phase 1 default: frontend + backend). */
  workerRoles: string[];
}

/** Root configuration object (PRD 2.21). */
export interface TagentConfig {
  version: string;
  port: number;
  /** Storage root: SQLite db lives in <storage>/sqlite, workspaces in <storage>/workspaces. */
  storage: string;
  /** Default workspace name agents operate in (Phase 1: single project). */
  workspace: string;
  telemetry: boolean;
  autoUpdate: boolean;
  defaultProvider: string;
  defaultModel: string;
  providers: Record<string, ProviderConfig>;
  roles: Record<RoleName, RoleConfig>;
  permissions: PermissionsConfig;
  performance: PerformanceConfig;
}
