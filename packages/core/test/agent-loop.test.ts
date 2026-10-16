/**
 * Path: packages/core/test/agent-loop.test.ts
 * Purpose: Agent loop tests with a scripted chat function — happy path,
 *          malformed response recovery, hard failure, max steps, event
 *          streaming, and filesChanged collection.
 * Dependencies: src/agent/loop
 */
import { describe, expect, test } from 'bun:test';
import { isOk } from '@tagent-office/shared';
import type { ChatMessage, ChatResponse } from '../src/providers/types';
import { parseAgentMessage, runAgentLoop, type AgentEvent } from '../src/agent/loop';
import type { ToolResult } from '../src/tools/types';

function chatResponse(content: string): ChatResponse {
  return { content, model: 'test', usage: { inputTokens: 1, outputTokens: 1 } };
}

/** Chat function driven by a queue of raw responses. */
function scriptedChat(responses: string[]) {
  let index = 0;
  const seen: ChatMessage[][] = [];
  return {
    seen,
    async chat(request: { messages: ChatMessage[] }): Promise<{ ok: true; value: ChatResponse }> {
      seen.push([...request.messages]); // copy: the loop mutates the same array
      const content = responses[Math.min(index, responses.length - 1)] ?? '';
      index++;
      return { ok: true, value: chatResponse(content) };
    },
  };
}

const writeOk: ToolResult = { ok: true, output: 'Wrote 11 bytes to hello.txt', data: { path: 'hello.txt', bytes: 11 } };

describe('parseAgentMessage', () => {
  test('parses a clean JSON action', () => {
    const result = parseAgentMessage('{"thought":"go","action":{"tool":"write_file","arguments":{"path":"a.txt"}}}');
    expect(isOk(result)).toBe(true);
  });

  test('parses JSON inside markdown fences', () => {
    const result = parseAgentMessage('```json\n{"thought":"go","action":{"tool":"finish","arguments":{}}}\n```');
    expect(isOk(result)).toBe(true);
  });

  test('parses JSON surrounded by prose', () => {
    const result = parseAgentMessage('Sure! Here is my action: {"thought":"go","action":{"tool":"bash","arguments":{"command":"ls"}}} hope that helps');
    expect(isOk(result)).toBe(true);
  });

  test('rejects non-JSON garbage', () => {
    expect(isOk(parseAgentMessage('I will just write the file now.'))).toBe(false);
    expect(isOk(parseAgentMessage(''))).toBe(false);
  });

  test('rejects JSON without an action object', () => {
    expect(isOk(parseAgentMessage('{"thought":"no action here"}'))).toBe(false);
  });
});

describe('runAgentLoop', () => {
  test('happy path: one tool call then finish', async () => {
    const chat = scriptedChat([
      '{"thought":"create","action":{"tool":"write_file","arguments":{"path":"hello.txt","content":"hello world"}}}',
      '{"thought":"done","action":{"tool":"finish","arguments":{"summary":"created hello.txt"}}}',
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgentLoop({
      chat: chat.chat,
      systemPrompt: 'sys',
      taskPrompt: 'do it',
      executeTool: async (tool) => (tool === 'write_file' ? writeOk : { ok: false, output: `Unknown tool ${tool}` }),
      maxSteps: 5,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe('done');
    expect(result.summary).toBe('created hello.txt');
    expect(result.filesChanged).toEqual(['hello.txt']);
    expect(result.steps.length).toBe(2);
    expect(result.tokens).toEqual({ input: 2, output: 2 });
    expect(events.map((event) => event.type)).toEqual(['progress', 'tool_call', 'tool_result', 'progress']);
  });

  test('malformed responses are retried with corrective feedback', async () => {
    const chat = scriptedChat([
      'I will create the file now.', // malformed
      '{"thought":"ok now","action":{"tool":"finish","arguments":{"summary":"recovered"}}}',
    ]);
    const result = await runAgentLoop({
      chat: chat.chat,
      systemPrompt: 'sys',
      taskPrompt: 'do it',
      executeTool: async () => writeOk,
      maxSteps: 5,
    });
    expect(result.status).toBe('done');
    // The corrective observation was appended as a user turn.
    const secondCall = chat.seen[1]!;
    expect(secondCall[secondCall.length - 1]?.content).toContain('NOT valid JSON');
  });

  test('three consecutive malformed responses fail the run', async () => {
    const chat = scriptedChat(['nope', 'still nope', 'never json']);
    const result = await runAgentLoop({
      chat: chat.chat,
      systemPrompt: 'sys',
      taskPrompt: 'do it',
      executeTool: async () => writeOk,
      maxSteps: 10,
    });
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('malformed');
  });

  test('max steps produce a max_steps result', async () => {
    const chat = scriptedChat(['{"thought":"loop","action":{"tool":"bash","arguments":{"command":"ls"}}}']);
    const result = await runAgentLoop({
      chat: chat.chat,
      systemPrompt: 'sys',
      taskPrompt: 'do it',
      executeTool: async () => ({ ok: true, output: 'exit code: 0\nstdout: (empty)' }),
      maxSteps: 3,
    });
    expect(result.status).toBe('max_steps');
    expect(result.steps.length).toBe(3);
  });

  test('tool failures are observable, not fatal', async () => {
    const chat = scriptedChat([
      '{"thought":"try","action":{"tool":"write_file","arguments":{"path":"../bad","content":"x"}}}',
      '{"thought":"adapt","action":{"tool":"finish","arguments":{"summary":"handled"}}}',
    ]);
    const result = await runAgentLoop({
      chat: chat.chat,
      systemPrompt: 'sys',
      taskPrompt: 'do it',
      executeTool: async () => ({ ok: false, output: 'write_file denied: path escapes the workspace jail' }),
      maxSteps: 5,
    });
    expect(result.status).toBe('done');
    expect(result.filesChanged).toEqual([]);
  });
});
