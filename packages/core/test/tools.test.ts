/**
 * Path: packages/core/test/tools.test.ts
 * Purpose: Tool tests — write_file (real disk writes, parent auto-create,
 *          jail rejections), read_file (happy, missing, truncation), bash
 *          (echo, exit codes, blocklist, timeout), and the registry gate.
 * Dependencies: src/tools/*
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOk } from '@tagent-office/shared';
import { createBashTool } from '../src/tools/bash';
import { createReadFileTool } from '../src/tools/read-file';
import { createBuiltinToolRegistry, ToolRegistry } from '../src/tools/registry';
import { createWriteFileTool } from '../src/tools/write-file';
import { PermissionChecker } from '../src/permissions/checker';
import type { ToolExecutionContext } from '../src/tools/types';

const WORKSPACE = join(tmpdir(), `tagent-tools-${Date.now()}`);

beforeAll(() => {
  mkdirSync(WORKSPACE, { recursive: true });
});

afterAll(() => {
  rmSync(WORKSPACE, { recursive: true, force: true });
});

function ctx(): ToolExecutionContext {
  return { workspaceRoot: WORKSPACE, workerId: 'FE-01', todoId: 'T-001' };
}

describe('write_file', () => {
  const tool = createWriteFileTool();

  test('writes real files to disk', async () => {
    const result = await tool.execute({ path: 'hello.txt', content: 'hello world' }, ctx());
    expect(result.ok).toBe(true);
    expect(existsSync(join(WORKSPACE, 'hello.txt'))).toBe(true);
    expect(readFileSync(join(WORKSPACE, 'hello.txt'), 'utf-8')).toBe('hello world');
    expect(result.data?.['path']).toBe('hello.txt');
  });

  test('auto-creates parent directories', async () => {
    const result = await tool.execute({ path: 'deep/nested/dir/file.txt', content: 'x' }, ctx());
    expect(result.ok).toBe(true);
    expect(existsSync(join(WORKSPACE, 'deep/nested/dir/file.txt'))).toBe(true);
  });

  test('rejects traversal outside the jail', async () => {
    const result = await tool.execute({ path: '../escape.txt', content: 'nope' }, ctx());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('denied');
    expect(existsSync(join(WORKSPACE, '..', 'escape.txt'))).toBe(false);
  });

  test('rejects non-string content and missing fields', async () => {
    expect((await tool.execute({ path: 'a.txt' }, ctx())).ok).toBe(false);
    expect((await tool.execute({ content: 'x' }, ctx())).ok).toBe(false);
    expect((await tool.execute('not-an-object', ctx())).ok).toBe(false);
  });
});

describe('read_file', () => {
  const tool = createReadFileTool();

  test('reads a file written by write_file', async () => {
    await createWriteFileTool().execute({ path: 'readme.md', content: '# Hi' }, ctx());
    const result = await tool.execute({ path: 'readme.md' }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output).toBe('# Hi');
  });

  test('missing file fails gracefully', async () => {
    const result = await tool.execute({ path: 'nope.txt' }, ctx());
    expect(result.ok).toBe(false);
  });

  test('directory target fails gracefully', async () => {
    const result = await tool.execute({ path: 'deep' }, ctx());
    expect(result.ok).toBe(false);
  });

  test('empty path fails gracefully', async () => {
    expect((await tool.execute({ path: '' }, ctx())).ok).toBe(false);
  });
});

describe('bash', () => {
  test('echoes and reports exit code 0', async () => {
    const result = await createBashTool().execute({ command: 'echo tagent' }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output).toContain('tagent');
    expect(result.output).toContain('exit code: 0');
  });

  test('non-zero exit codes are reported, not hidden', async () => {
    const result = await createBashTool().execute({ command: 'exit 3' }, ctx());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('exit code: 3');
  });

  test('blocklisted commands never reach a shell', async () => {
    const result = await createBashTool().execute({ command: 'rm -rf /' }, ctx());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('denied');
  });

  test('runs with the workspace as cwd', async () => {
    writeFileSync(join(WORKSPACE, 'cwd-marker.txt'), 'here');
    const result = await createBashTool().execute({ command: 'ls cwd-marker.txt' }, ctx());
    expect(result.ok).toBe(true);
  });

  test('timeout kills long-running commands', async () => {
    const tool = createBashTool({ timeoutMs: 150 });
    const started = Date.now();
    const result = await tool.execute({ command: 'sleep 5 && echo late' }, ctx());
    const elapsed = Date.now() - started;
    expect(result.ok).toBe(false);
    expect(result.output).toContain('timed out');
    expect(elapsed).toBeLessThan(4000);
  }, 10_000);
});

describe('ToolRegistry + permission gate', () => {
  function registry(tools: Record<string, 'allow' | 'ask' | 'deny'>, autoApproveAsk = true): ToolRegistry {
    return new ToolRegistry({
      checker: new PermissionChecker({ tools, autoApproveAsk }),
    });
  }

  test('executes allowed tools', async () => {
    const reg = registry({ write_file: 'allow' });
    reg.register(createWriteFileTool());
    const result = await reg.execute('write_file', { path: 'via-registry.txt', content: 'yes' }, ctx());
    expect(result.ok).toBe(true);
    expect(existsSync(join(WORKSPACE, 'via-registry.txt'))).toBe(true);
  });

  test('denied tools are refused before execution', async () => {
    const reg = registry({ write_file: 'deny' });
    reg.register(createWriteFileTool());
    const result = await reg.execute('write_file', { path: 'denied.txt', content: 'no' }, ctx());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Permission denied');
    expect(existsSync(join(WORKSPACE, 'denied.txt'))).toBe(false);
  });

  test('"ask" with auto-approve off refuses execution', async () => {
    const reg = registry({ write_file: 'ask' }, false);
    reg.register(createWriteFileTool());
    const result = await reg.execute('write_file', { path: 'asked.txt', content: 'maybe' }, ctx());
    expect(result.ok).toBe(false);
    expect(existsSync(join(WORKSPACE, 'asked.txt'))).toBe(false);
  });

  test('unknown tools return a helpful message', async () => {
    const reg = registry({});
    const result = await reg.execute('does_not_exist', {}, ctx());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Unknown tool');
  });

  test('builtin factory registers the Phase 1 tool set', () => {
    const reg = createBuiltinToolRegistry({
      checker: new PermissionChecker({ tools: {}, autoApproveAsk: true }),
    });
    expect(reg.list().map((tool) => tool.name).sort()).toEqual(['bash', 'read_file', 'write_file']);
    expect(isOk(reg.register(createWriteFileTool()))).toBe(false); // duplicate rejected
  });
});
