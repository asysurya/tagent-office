# @tagent-office/memory

Memory system — **STUB, Phase 7** (PRD 2.17). The contract is frozen:

- Layers: project (shared), agent personal, manager.
- Types: semantic / episodic / procedural.
- Selective encoding via salience (already implemented as pure math: filesChanged > 3 → +2, userSaid("penting"/"remember") → +5, newDecision → +3, reverted → +2, failedThenSucceeded → +3, touchesArchitecture → +4).
- Retrieval: similarity × importance × recency × recall_count, with decay and consolidation every 20 iterations.
- Iteration logs: one `iter-NNN.md` per completed directive (directive, delta, decisions, learnings, memory candidates).

The SQLite `memories` table already exists (PRD 2.25). `createMemoryService()` currently refuses writes/reads; `salience()` works.
