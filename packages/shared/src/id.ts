/**
 * Path: packages/shared/src/id.ts
 * Purpose: Deterministic, resumable ID generator. Formats: T-001, dir-001,
 *          iter-001, clar-001, FE-01, BE-01, QA-01, VIS-01. Counters can be
 *          seeded from the store so IDs survive restarts (resume-safe).
 * Dependencies: none
 */

/** All ID prefixes used by the system. */
export type IdPrefix = 'T' | 'dir' | 'iter' | 'clar' | 'FE' | 'BE' | 'QA' | 'VIS';

/** Zero-padding width per prefix. */
const PAD_WIDTH: Readonly<Record<IdPrefix, number>> = {
  T: 3,
  dir: 3,
  iter: 3,
  clar: 3,
  FE: 2,
  BE: 2,
  QA: 2,
  VIS: 2,
};

/** Returns the highest sequence number already used for a prefix. */
export type SeedLoader = (prefix: IdPrefix) => number;

/** Format a prefix + sequence into a stable id, e.g. ("FE", 1) -> "FE-01". */
export function formatId(prefix: IdPrefix, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(PAD_WIDTH[prefix], '0')}`;
}

/** Parse "FE-01" back into { prefix: "FE", sequence: 1 }; null when malformed. */
export function parseId(id: string): { prefix: string; sequence: number } | null {
  const match = /^([A-Za-z]+)-(\d+)$/.exec(id);
  if (match === null) return null;
  const sequence = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(sequence)) return null;
  return { prefix: match[1] ?? '', sequence };
}

/**
 * Monotonic per-prefix id generator. Optionally seeded via a loader (usually
 * the SQLite store scanning max existing sequence) so restarts never collide.
 */
export class IdGenerator {
  private readonly counters = new Map<IdPrefix, number>();
  private readonly seeded = new Set<IdPrefix>();

  constructor(private readonly seedLoader?: SeedLoader) {}

  /** Next id for a prefix. */
  next(prefix: IdPrefix): string {
    let current = this.counters.get(prefix);
    if (current === undefined && !this.seeded.has(prefix)) {
      current = this.seedLoader?.(prefix) ?? 0;
      this.seeded.add(prefix);
    }
    const sequence = (current ?? 0) + 1;
    this.counters.set(prefix, sequence);
    return formatId(prefix, sequence);
  }

  /** Highest sequence handed out for a prefix (0 when none). */
  current(prefix: IdPrefix): number {
    return this.counters.get(prefix) ?? 0;
  }
}
