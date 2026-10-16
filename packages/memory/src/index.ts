/**
 * Path: packages/memory/src/index.ts
 * Purpose: Memory system STUB (Phase 7, PRD 2.17). Layers (project shared /
 *          agent personal / manager), types (semantic / episodic /
 *          procedural), selective encoding via salience, similarity *
 *          importance * recency retrieval, decay, consolidation every 20
 *          iterations, iteration logs (iter-NNN.md). Implementation lands in
 *          Phase 7; the SQLite memories table already exists (PRD 2.25).
 * Dependencies: @tagent-office/shared
 */
import { err, type Result } from '@tagent-office/shared';

/** Memory layers. */
export type MemoryScope = 'project' | 'agent' | 'manager';

/** Memory types (PRD 2.17). */
export type MemoryType = 'semantic' | 'episodic' | 'procedural';

/** Salience factors feeding the encoding decision. */
export interface SalienceFactors {
  filesChanged: number;
  userSaidImportant: boolean;
  newDecision: boolean;
  reverted: boolean;
  failedThenSucceeded: boolean;
  touchesArchitecture: boolean;
}

/** A stored memory record. */
export interface MemoryRecord {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  agentId: string | null;
  content: string;
  importance: number; // 1-10
  tags: string[];
  recallCount: number;
  lastRecalledAt: number | null;
  createdAt: number;
}

/** Memory service contract (stable across phases). */
export interface MemoryService {
  remember(record: Omit<MemoryRecord, 'id' | 'recallCount' | 'lastRecalledAt' | 'createdAt'>): Promise<Result<MemoryRecord, Error>>;
  recall(query: { scope: MemoryScope; agentId?: string; limit?: number }): Promise<Result<MemoryRecord[], Error>>;
  salience(factors: SalienceFactors): number;
}

/** Phase 1 stub: freezes the API, refuses to run. */
export function createMemoryService(): MemoryService {
  return {
    async remember() {
      return err(new Error('Memory system is a Phase 7 deliverable; "remember" is not implemented yet.'));
    },
    async recall() {
      return err(new Error('Memory system is a Phase 7 deliverable; "recall" is not implemented yet.'));
    },
    salience(factors: SalienceFactors): number {
      // PRD 2.17 factors — cheap, pure, so Phase 1 ships the math already.
      let score = 0;
      if (factors.filesChanged > 3) score += 2;
      if (factors.userSaidImportant) score += 5;
      if (factors.newDecision) score += 3;
      if (factors.reverted) score += 2;
      if (factors.failedThenSucceeded) score += 3;
      if (factors.touchesArchitecture) score += 4;
      return score;
    },
  };
}
