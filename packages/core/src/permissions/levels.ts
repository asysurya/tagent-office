/**
 * Path: packages/core/src/permissions/levels.ts
 * Purpose: Risk classification for tools (PRD 2.19): safe = auto allow,
 *          normal = Manager decides, krusial = escalate to the user when
 *          the Manager is unsure.
 * Dependencies: ../tools/types
 */
import type { ToolRiskLevel } from '../tools/types';

/** Default decision per risk level when no config override exists. */
export const RISK_DEFAULT_DECISION: Readonly<Record<ToolRiskLevel, 'allow' | 'ask'>> = {
  safe: 'allow',
  normal: 'ask',
  krusial: 'ask',
};

/** Human-readable meaning per risk level (used in docs and the GUI). */
export const RISK_DESCRIPTION: Readonly<Record<ToolRiskLevel, string>> = {
  safe: 'read-only operations — auto allowed',
  normal: 'mutating operations — Manager decides',
  krusial: 'destructive or irreversible operations — escalate to user',
};
