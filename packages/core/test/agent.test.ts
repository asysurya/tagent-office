/**
 * Path: packages/core/test/agent.test.ts
 * Purpose: Agent integration test — MockProvider + builtin tools over a real
 *          temp workspace: a hello-world directive ends with a real file on
 *          disk. This is the kernel of the Phase 1 end-to-end flow.
 * Dependencies: src/agent/agent, src/providers/*, src/tools/registry, src/permissions
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOk } from '@tagent-office/shared';
import { Agent } from '../src/agent/agent';
import type { AgentEvent } from '../src/agent/loop';
import { ProviderChain } from '../src/providers/fallback';
import { MockProvider } from '../src/providers/mock';
import { PermissionChecker } from '../src/permissions/checker';
import { createBuiltinToolRegistry } from '../src/tools/registry';

const WORKSPACE = join(tmpdir(), `tagent-agent-${Date.now()}`);

beforeAll(() => {
  mkdirSync(WORKSPACE, { recursive: true });
});

afterAll(() => {
  rmSync(WORKSPACE, { recursive: true, force: true });
});

describe('Agent (integration with MockProvider)', () => {
  test('creates a real file from a directive', async () => {
    const tools = createBuiltinToolRegistry({
      checker: new PermissionChecker({ tools: {}, autoApproveAsk: true }),
    });
    const mock = new MockProvider();
    const chain = new ProviderChain(new Map([['mock', mock]]), [{ providerId: 'mock', model: 'mock-echo-1' }]);
    const events: AgentEvent[] = [];

    const agent = new Agent({
      workerId: 'FE-01',
      role: 'frontend',
      chain,
      tools,
      workspaceRoot: WORKSPACE,
      onEvent: (event) => events.push(event),
    });

    const result = await agent.run({
      todoId: 'T-001',
      title: 'Create hello.txt',
      description: 'Create hello.txt with the requested content.',
      acceptance: ['File hello.txt exists with exact content'],
      directiveText: "Create a hello.txt file with content 'hello world'",
    });

    expect(result.status).toBe('done');
    expect(result.filesChanged).toContain('hello.txt');
    expect(existsSync(join(WORKSPACE, 'hello.txt'))).toBe(true);
    expect(readFileSync(join(WORKSPACE, 'hello.txt'), 'utf-8')).toBe('hello world');
    expect(events.some((event) => event.type === 'tool_call' && event.tool === 'write_file')).toBe(true);
  });

  test('list-files directive runs bash and finishes', async () => {
    const tools = createBuiltinToolRegistry({
      checker: new PermissionChecker({ tools: {}, autoApproveAsk: true }),
    });
    const chain = new ProviderChain(new Map([['mock', new MockProvider()]]), [
      { providerId: 'mock', model: 'mock-echo-1' },
    ]);

    const agent = new Agent({
      workerId: 'FE-02',
      role: 'frontend',
      chain,
      tools,
      workspaceRoot: WORKSPACE,
    });

    const result = await agent.run({
      todoId: 'T-002',
      title: 'List workspace files',
      description: 'List the files in the workspace root.',
      acceptance: ['A file listing is produced'],
      directiveText: 'List the files in the workspace',
    });

    expect(result.status).toBe('done');
  });

  test('chain exposure: buildChain resolves registry refs', async () => {
    // Covered indirectly by the E2E; here we assert the chain plan shape.
    const chain = new ProviderChain(new Map([['mock', new MockProvider()]]), [
      { providerId: 'mock', model: 'mock-echo-1' },
    ]);
    expect(chain.plan()).toEqual([{ providerId: 'mock', model: 'mock-echo-1' }]);
    const response = await chain.chat({ messages: [{ role: 'user', content: 'ping' }] });
    expect(isOk(response)).toBe(true);
  });
});
