/**
 * Path: packages/core/test/permissions.test.ts
 * Purpose: Permission checker tests — config overrides, risk-level defaults,
 *          Phase 1 auto-approve policy (PRD 2.19).
 * Dependencies: src/permissions/*
 */
import { describe, expect, test } from 'bun:test';
import { PermissionChecker } from '../src/permissions/checker';
import { RISK_DEFAULT_DECISION, RISK_DESCRIPTION } from '../src/permissions/levels';
import type { Tool } from '../src/tools/types';

function fakeTool(name: string, risk: 'safe' | 'normal' | 'krusial'): Tool {
  return {
    name,
    description: `fake ${name}`,
    parameters: {},
    riskLevel: risk,
    async execute() {
      return { ok: true, output: 'fake' };
    },
  };
}

describe('PermissionChecker', () => {
  test('config overrides win over risk defaults', () => {
    const checker = new PermissionChecker({ tools: { read_file: 'deny' }, autoApproveAsk: true });
    const outcome = checker.check(fakeTool('read_file', 'safe'), {});
    expect(outcome.decision).toBe('deny');
    expect(outcome.reason).toContain('config override');
  });

  test('safe tools default to allow without config', () => {
    const checker = new PermissionChecker({ tools: {}, autoApproveAsk: true });
    expect(checker.check(fakeTool('read_file', 'safe'), {}).decision).toBe('allow');
  });

  test('normal and krusial tools default to ask', () => {
    const checker = new PermissionChecker({ tools: {}, autoApproveAsk: true });
    expect(checker.check(fakeTool('write_file', 'normal'), {}).decision).toBe('ask');
    expect(checker.check(fakeTool('nuke', 'krusial'), {}).decision).toBe('ask');
  });

  test('auto-approve policy is reported for Phase 1 ask flows', () => {
    expect(new PermissionChecker({ tools: {}, autoApproveAsk: true }).shouldAutoApproveAsk()).toBe(true);
    expect(new PermissionChecker({ tools: {}, autoApproveAsk: false }).shouldAutoApproveAsk()).toBe(false);
  });
});

describe('risk levels', () => {
  test('every risk level has a default decision and a description', () => {
    for (const level of ['safe', 'normal', 'krusial'] as const) {
      expect(RISK_DEFAULT_DECISION[level]).toBeDefined();
      expect(RISK_DESCRIPTION[level].length).toBeGreaterThan(0);
    }
  });
});
