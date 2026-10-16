/**
 * Path: packages/core/src/tools/types.ts
 * Purpose: Tool contract. Tools receive `unknown` args and validate them
 *          with their own type guards — never `any` (work rule #1).
 * Dependencies: @tagent-office/shared
 */

/** Runtime context every tool executes under. */
export interface ToolExecutionContext {
  /** Absolute workspace root; all paths are jailed to it. */
  workspaceRoot: string;
  workerId: string;
  todoId: string;
}

/** Structured result of a tool call. `output` is what the LLM observes. */
export interface ToolResult {
  ok: boolean;
  output: string;
  /** Structured extras, e.g. { path } for files written. */
  data?: Record<string, unknown>;
}

/** Risk classification driving permission defaults (PRD 2.19). */
export type ToolRiskLevel = 'safe' | 'normal' | 'krusial';

/** A tool an agent may call. */
export interface Tool {
  readonly name: string;
  readonly description: string;
  /** JSON-schema-ish parameter description embedded in prompts. */
  readonly parameters: Record<string, unknown>;
  readonly riskLevel: ToolRiskLevel;
  execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolResult>;
}

/** Union of built-in tool names. */
export type BuiltinToolName = 'read_file' | 'write_file' | 'bash' | 'finish';

/** Re-exported from shared so tool modules can import it from one place. */
export { isRecord } from '@tagent-office/shared';

/** Type guard + coercion: record with a string field. */
export function requireString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
