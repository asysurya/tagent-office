/**
 * Path: packages/orchestrator/test/priority.test.ts
 * Purpose: Priority model tests against the exact PRD 2.11 numbers.
 * Dependencies: src/todo/priority
 */
import { describe, expect, test } from 'bun:test';
import { categoryForPriority, computePriority } from '../src/todo/priority';

describe('computePriority (PRD 2.11)', () => {
  test('base priority per type', () => {
    expect(computePriority({ type: 'feature', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(60);
    expect(computePriority({ type: 'refactor', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(40);
    expect(computePriority({ type: 'chore', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(30);
    expect(computePriority({ type: 'investigate', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(50);
  });

  test('bug normal is 70, bug critical is 95', () => {
    expect(computePriority({ type: 'bug', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(80); // 70 base + 10 bug
    expect(computePriority({ type: 'bug', category: 'critical', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(100); // 95 + 10, capped
  });

  test('feature critical path is 80', () => {
    expect(computePriority({ type: 'feature', category: 'critical', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false })).toBe(80);
  });

  test('blocking many todos adds +20', () => {
    const score = computePriority({ type: 'feature', category: 'normal', blocksCount: 3, ageMinutes: 0, depsSatisfied: false, userBoost: false });
    expect(score).toBe(80); // 60 + 20
  });

  test('blocking a few todos adds +10', () => {
    const score = computePriority({ type: 'feature', category: 'normal', blocksCount: 2, ageMinutes: 0, depsSatisfied: false, userBoost: false });
    expect(score).toBe(70); // 60 + 10
  });

  test('aging adds +2 per minute capped at +20', () => {
    expect(computePriority({ type: 'feature', category: 'normal', blocksCount: 0, ageMinutes: 5, depsSatisfied: false, userBoost: false })).toBe(70);
    expect(computePriority({ type: 'feature', category: 'normal', blocksCount: 0, ageMinutes: 30, depsSatisfied: false, userBoost: false })).toBe(80);
  });

  test('deps satisfied adds +15 and user boost +30', () => {
    expect(computePriority({ type: 'feature', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: true, userBoost: false })).toBe(75);
    expect(computePriority({ type: 'feature', category: 'normal', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: true })).toBe(90);
  });

  test('everything stacks then caps at 100 and floors at 0', () => {
    const stacked = computePriority({ type: 'bug', category: 'critical', blocksCount: 5, ageMinutes: 60, depsSatisfied: true, userBoost: true });
    expect(stacked).toBe(100);
    expect(computePriority({ type: 'chore', category: 'low', blocksCount: 0, ageMinutes: 0, depsSatisfied: false, userBoost: false, base: -50 })).toBe(0);
  });
});

describe('categoryForPriority', () => {
  test('maps scores back to PRD bands', () => {
    expect(categoryForPriority(95)).toBe('critical');
    expect(categoryForPriority(90)).toBe('critical');
    expect(categoryForPriority(89)).toBe('high');
    expect(categoryForPriority(70)).toBe('high');
    expect(categoryForPriority(69)).toBe('normal');
    expect(categoryForPriority(40)).toBe('normal');
    expect(categoryForPriority(39)).toBe('low');
    expect(categoryForPriority(0)).toBe('low');
  });
});
