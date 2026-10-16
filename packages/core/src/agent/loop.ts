/**
 * Path: packages/core/src/agent/loop.ts
 * Purpose: The think -> act -> observe loop. Pure logic with injected
 *          dependencies (chat fn, tool executor) so tests never need a
 *          network. Malformed model output is retried with corrective
 *          feedback; after MAX_MALFORMED_RESPONSES the run fails (the caller's
 *          provider chain may then fall back, PRD 2.15).
 * Dependencies: ../providers/types, ../tools/types, @tagent-office/shared
 */
import { err, isErr, isRecord, ok, type Result } from '@tagent-office/shared';
import { ValidationError } from '@tagent-office/shared';
import type { ChatRequest, ChatResponse } from '../providers/types';
import type { ToolResult } from '../tools/types';

/** One parsed model turn. */
export interface ParsedAgentMessage {
  thought: string;
  tool: string;
  arguments: Record<string, unknown>;
}

/** Step telemetry for the run. */
export interface AgentStep {
  step: number;
  thought: string;
  tool: string | null;
  args: unknown;
  ok: boolean | null;
  output: string | null;
}

/** Streamed agent events (translated to office:* bus events upstream). */
export type AgentEvent =
  | { type: 'progress'; step: number; thought: string }
  | { type: 'tool_call'; step: number; tool: string; args: unknown }
  | { type: 'tool_result'; step: number; tool: string; ok: boolean; output: string };

/** Final run outcome. */
export interface AgentRunResult {
  status: 'done' | 'failed' | 'max_steps';
  summary: string | null;
  steps: AgentStep[];
  filesChanged: string[];
  tokens: { input: number; output: number };
}

/** Loop dependencies, all injectable. */
export interface AgentLoopDeps {
  chat: (request: ChatRequest) => Promise<Result<ChatResponse, Error>>;
  systemPrompt: string;
  taskPrompt: string;
  executeTool: (tool: string, args: unknown) => Promise<ToolResult>;
  maxSteps: number;
  maxMalformed?: number;
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Parse a raw model response into a thought + action. Tolerates code fences
 * and surrounding prose, but the JSON object itself must be valid.
 */
export function parseAgentMessage(raw: string): Result<ParsedAgentMessage, ValidationError> {
  const stripped = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const candidates = [stripped];
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(stripped.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!isRecord(parsed)) continue;
      const action = parsed['action'];
      if (!isRecord(action)) continue;
      const tool = action['tool'];
      if (typeof tool !== 'string' || tool.length === 0) continue;
      const args = action['arguments'];
      const thought = parsed['thought'];
      return ok({
        thought: typeof thought === 'string' ? thought : '',
        tool,
        arguments: isRecord(args) ? args : {},
      });
    } catch {
      // try the next candidate
    }
  }
  return err(new ValidationError('Model response is not valid action JSON', { raw: raw.slice(0, 300) }));
}

/** Run the loop. */
export async function runAgentLoop(deps: AgentLoopDeps): Promise<AgentRunResult> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: deps.systemPrompt },
    { role: 'user', content: deps.taskPrompt },
  ];

  const steps: AgentStep[] = [];
  const filesChanged: string[] = [];
  const tokens = { input: 0, output: 0 };
  let malformed = 0;
  const maxMalformed = deps.maxMalformed ?? 3;

  for (let step = 1; step <= deps.maxSteps; step++) {
    const response = await deps.chat({ messages });
    if (isErr(response)) {
      return {
        status: 'failed',
        summary: `provider failed: ${response.error.message}`,
        steps,
        filesChanged,
        tokens,
      };
    }

    tokens.input += response.value.usage?.inputTokens ?? 0;
    tokens.output += response.value.usage?.outputTokens ?? 0;
    messages.push({ role: 'assistant', content: response.value.content });

    const parsed = parseAgentMessage(response.value.content);
    if (isErr(parsed)) {
      malformed++;
      steps.push({ step, thought: '(malformed)', tool: null, args: null, ok: null, output: null });
      if (malformed >= maxMalformed) {
        return {
          status: 'failed',
          summary: `model produced ${malformed} malformed responses in a row`,
          steps,
          filesChanged,
          tokens,
        };
      }
      messages.push({
        role: 'user',
        content: `OBSERVATION (step ${step}): Your previous response was NOT valid JSON. Respond with ONE JSON object only, no markdown fences, following the protocol.`,
      });
      continue;
    }

    const { thought, tool } = parsed.value;
    deps.onEvent?.({ type: 'progress', step, thought });

    if (tool === 'finish') {
      const summary = typeof parsed.value.arguments['summary'] === 'string'
        ? (parsed.value.arguments['summary'] as string)
        : 'Task finished.';
      steps.push({ step, thought, tool, args: parsed.value.arguments, ok: true, output: null });
      return { status: 'done', summary, steps, filesChanged, tokens };
    }

    deps.onEvent?.({ type: 'tool_call', step, tool, args: parsed.value.arguments });
    const result = await deps.executeTool(tool, parsed.value.arguments);
    deps.onEvent?.({ type: 'tool_result', step, tool, ok: result.ok, output: result.output });

    steps.push({ step, thought, tool, args: parsed.value.arguments, ok: result.ok, output: result.output });

    const changedPath = result.data?.['path'];
    if (typeof changedPath === 'string' && !filesChanged.includes(changedPath)) {
      filesChanged.push(changedPath);
    }

    messages.push({ role: 'user', content: `OBSERVATION (step ${step}): ${result.output}` });
  }

  return {
    status: 'max_steps',
    summary: `reached the maximum of ${deps.maxSteps} steps without finishing`,
    steps,
    filesChanged,
    tokens,
  };
}
