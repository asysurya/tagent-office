/**
 * Path: packages/core/src/tools/jail.ts
 * Purpose: File jail — every tool path must resolve inside the workspace
 *          root. Validation is LOGICAL and works before parent directories
 *          exist (anti-pattern #7: never create the parent first, then check).
 *          Symlink escapes are caught via best-effort realpath of the deepest
 *          existing ancestor.
 * Dependencies: node:path, node:fs, @tagent-office/shared
 */
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { mkdirSync, realpathSync } from 'node:fs';
import { err, ok, type Result } from '@tagent-office/shared';
import { PermissionError } from '@tagent-office/shared';

/** Resolved jailed path details. */
export interface JailedPath {
  /** Absolute (normalized, best-effort real) path of the target. */
  abs: string;
  /** Path relative to the workspace root (no leading slash). */
  rel: string;
}

/** realpath the deepest existing ancestor of `p` (works for not-yet-existing files). */
function realPathBestEffort(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    if (parent === p) return p;
    return join(realPathBestEffort(parent), basename(p));
  }
}

/**
 * Validate and resolve a user/model-supplied path against the jail.
 * Accepts absolute paths that already live inside the root plus any
 * relative path; rejects traversal, absolute outsiders, and empty input.
 */
export function resolveJailedPath(root: string, input: string): Result<JailedPath, PermissionError> {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return err(new PermissionError('Path must be a non-empty string'));
  }
  if (input.includes('\0')) {
    return err(new PermissionError('Path must not contain NUL bytes'));
  }

  const rootReal = realPathBestEffort(resolve(root));
  const target = resolve(rootReal, input);
  const targetReal = realPathBestEffort(target);

  const rel = relative(rootReal, targetReal);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
    return err(
      new PermissionError(`Path escapes the workspace jail: ${input}`, {
        workspaceRoot: rootReal,
        resolved: targetReal,
      }),
    );
  }

  return ok({ abs: targetReal, rel });
}

/** Create parent directories for a (already jail-validated) absolute path. */
export function ensureParentDir(abs: string): Result<null, Error> {
  try {
    mkdirSync(dirname(abs), { recursive: true });
    return ok(null);
  } catch (error: unknown) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
