/**
 * Path: packages/core/src/permissions/checker.ts
 * Purpose: Permission checker combining config overrides with risk-level
 *          defaults. Phase 1 policy: "ask" results are auto-approved and
 *          logged when permissions.autoApproveAsk is true (the real approval
 *          queue arrives in Phase 4). Blocklist/jail rejections are separate
 *          hard denials inside the tools themselves.
 * Dependencies: @tagent-office/shared, ./levels, ../tools/types
 */
import type { PermissionsConfig, ToolPermission } from '@tagent-office/shared';
import type { Tool } from '../tools/types';
import { RISK_DEFAULT_DECISION } from './levels';

/** Outcome of a permission check. */
export interface PermissionOutcome {
  decision: ToolPermission;
  /** Why this decision was made (logged for auditability). */
  reason: string;
  /** True when an "ask" was auto-approved under the Phase 1 policy. */
  autoApproved: boolean;
}

/** Checks tool calls against config + risk defaults. */
export class PermissionChecker {
  constructor(private readonly config: PermissionsConfig) {}

  /** Decide for a tool invocation. */
  check(tool: Tool, _args: unknown): PermissionOutcome {
    const override = this.config.tools[tool.name];
    if (override !== undefined) {
      return { decision: override, reason: `config override for tool "${tool.name}"`, autoApproved: false };
    }
    const decision = RISK_DEFAULT_DECISION[tool.riskLevel];
    return { decision, reason: `risk level "${tool.riskLevel}" default`, autoApproved: false };
  }

  /** Phase 1 policy: auto-approve "ask" outcomes when configured. */
  shouldAutoApproveAsk(): boolean {
    return this.config.autoApproveAsk;
  }
}
