/**
 * Path: packages/core/test/jail.test.ts
 * Purpose: File jail tests — traversal, absolute outsiders, symlink escapes,
 *          logical validation before parents exist (anti-pattern #7).
 * Dependencies: src/tools/jail
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isErr, isOk } from '@tagent-office/shared';
import { ensureParentDir, resolveJailedPath } from '../src/tools/jail';

const ROOT = join(tmpdir(), `tagent-jail-${Date.now()}`);
const OUTSIDE = join(tmpdir(), `tagent-outside-${Date.now()}`);

beforeAll(() => {
  mkdirSync(join(ROOT, 'src'), { recursive: true });
  writeFileSync(join(ROOT, 'src', 'a.ts'), 'export {};\n');
  mkdirSync(OUTSIDE, { recursive: true });
  writeFileSync(join(OUTSIDE, 'secret.txt'), 'outside\n');
  // Symlink inside the root that points outside the jail.
  symlinkSync(OUTSIDE, join(ROOT, 'escape-link'));
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
});

describe('jail — valid paths', () => {
  test('relative path resolves inside the root', () => {
    const result = resolveJailedPath(ROOT, 'src/a.ts');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.rel).toBe(join('src', 'a.ts'));
      expect(result.value.abs.startsWith(ROOT)).toBe(true);
    }
  });

  test('absolute path already inside the root is accepted', () => {
    const result = resolveJailedPath(ROOT, join(ROOT, 'src/a.ts'));
    expect(isOk(result)).toBe(true);
  });

  test('nested not-yet-existing path validates logically (anti-pattern #7)', () => {
    const result = resolveJailedPath(ROOT, 'new/deep/dir/file.txt');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.rel).toBe(join('new', 'deep', 'dir', 'file.txt'));
  });

  test('redundant segments normalize away', () => {
    const result = resolveJailedPath(ROOT, './src/../src/./a.ts');
    expect(isOk(result)).toBe(true);
  });
});

describe('jail — rejections', () => {
  test('parent traversal escapes are denied', () => {
    expect(isErr(resolveJailedPath(ROOT, '../outside.txt'))).toBe(true);
  });

  test('deep traversal escapes are denied', () => {
    expect(isErr(resolveJailedPath(ROOT, 'src/../../../../etc/passwd'))).toBe(true);
  });

  test('absolute outside path is denied', () => {
    expect(isErr(resolveJailedPath(ROOT, join(OUTSIDE, 'secret.txt')))).toBe(true);
  });

  test('symlink pointing outside is denied', () => {
    expect(isErr(resolveJailedPath(ROOT, 'escape-link/secret.txt'))).toBe(true);
  });

  test('the root itself is rejected (not a file target)', () => {
    expect(isErr(resolveJailedPath(ROOT, '.'))).toBe(true);
  });

  test('empty and NUL inputs are denied', () => {
    expect(isErr(resolveJailedPath(ROOT, ''))).toBe(true);
    expect(isErr(resolveJailedPath(ROOT, 'bad\0path'))).toBe(true);
  });
});

describe('ensureParentDir', () => {
  test('creates missing parents recursively after validation', () => {
    const jailed = resolveJailedPath(ROOT, 'brand/new/nested/file.txt');
    if (isOk(jailed)) {
      const created = ensureParentDir(jailed.value.abs);
      expect(isOk(created)).toBe(true);
    }
  });
});
