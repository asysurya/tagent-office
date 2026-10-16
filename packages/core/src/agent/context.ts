/**
 * Path: packages/core/src/agent/context.ts
 * Purpose: Message assembly for agent runs: system prompt + task prompt.
 *          Memory injection hooks arrive in Phase 7 — the shape below is
 *          already future-proof for it.
 * Dependencies: ./prompt, ../providers/types, @tagent-office/shared
 */
import type { ChatMessage } from '../providers/types';
import { buildTaskPrompt, buildWorkerSystemPrompt, type AgentTaskPromptInput, type WorkerSystemPromptOptions } from './prompt';

/** Options to build the opening messages of an agent run. */
export interface BuildContextOptions extends WorkerSystemPromptOptions {
  task: AgentTaskPromptInput;
}

/** Build [system, user] opening messages for a run. */
export function buildContext(options: BuildContextOptions): ChatMessage[] {
  return [
    { role: 'system', content: buildWorkerSystemPrompt(options) },
    { role: 'user', content: buildTaskPrompt(options.task) },
  ];
}
