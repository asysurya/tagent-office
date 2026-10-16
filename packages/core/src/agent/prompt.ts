/**
 * Path: packages/core/src/agent/prompt.ts
 * Purpose: System/task prompt templates. The worker protocol is a strict
 *          JSON action format — one action per turn — that works on every
 *          OpenAI-compatible endpoint, including models without native
 *          tool-calling. Markers let the MockProvider route its behavior.
 * Dependencies: ./types (tools), ../providers/mock, @tagent-office/shared
 */
import { MANAGER_BREAKDOWN_MARKER, WORKER_MARKER } from '../providers/mock';
import type { Tool } from '../tools/types';

/** Options for the worker system prompt. */
export interface WorkerSystemPromptOptions {
  workerId: string;
  role: string;
  workspaceRoot: string;
  tools: Tool[];
}

/** Build the worker system prompt (contains the TAGENT-WORKER marker). */
export function buildWorkerSystemPrompt(options: WorkerSystemPromptOptions): string {
  const toolDocs = options.tools
    .map((tool) => `- ${tool.name} (risk: ${tool.riskLevel}): ${tool.description}\n  parameters: ${JSON.stringify(tool.parameters)}`)
    .join('\n');

  return `You are worker "${options.workerId}" (role: ${options.role}) in Tagent Office, a self-hosted AI team.
You operate inside the workspace root: ${options.workspaceRoot}
All file tools are jailed to this root — paths outside it are rejected.

AVAILABLE TOOLS:
${toolDocs}

RESPONSE PROTOCOL (STRICT) — ${WORKER_MARKER}
Respond with EXACTLY ONE JSON object and nothing else. No markdown, no prose outside the JSON.

To call a tool:
{"thought": "<one short sentence of reasoning>", "action": {"tool": "<tool name>", "arguments": {...}}}

To finish the task:
{"thought": "<one short sentence>", "action": {"tool": "finish", "arguments": {"summary": "<what was accomplished>"}}}

RULES:
- One action per turn. After each action you will receive an OBSERVATION.
- Choose "finish" only when the acceptance criteria are met.
- Never fabricate results: only claim what observations confirm.
- If a tool fails, read the error in the observation and adapt.`;
}

/** Build the manager breakdown system prompt (contains the manager marker). */
export function buildManagerBreakdownSystemPrompt(): string {
  return `You are the Manager of Tagent Office. Your only job is to break a user directive into atomic todos. You never write code yourself.
MARKER: ${MANAGER_BREAKDOWN_MARKER}

Respond with EXACTLY ONE JSON object and nothing else:
{
  "confidence": <number 0-1 — how confident you are that the directive is fully understood>,
  "notes": "<optional one-line note>",
  "todos": [
    {
      "title": "<imperative, <= 80 chars>",
      "description": "<what to do, addressed to the worker>",
      "type": "feature" | "bug" | "refactor" | "chore" | "investigate" | "test",
      "role": "frontend" | "backend" | "qa" | "any",
      "category": "critical" | "high" | "normal" | "low",
      "acceptance": ["<observable criterion>", ...],
      "testScenarios": ["<scenario>", ...],
      "requiresQA": <boolean>
    }
  ]
}

RULES:
- Confidence below 0.85 means you are not sure: return that confidence and an EMPTY todos array — the system will ask the user for clarification instead.
- Keep todos atomic: one todo = one verifiable outcome.
- acceptance criteria must be checkable from the workspace state.`;
}

/** Task info for the worker's first user message. */
export interface AgentTaskPromptInput {
  todoId: string;
  title: string;
  description: string;
  acceptance: string[];
  directiveText: string;
}

/** Build the worker's task prompt. */
export function buildTaskPrompt(task: AgentTaskPromptInput): string {
  const acceptance = task.acceptance.length > 0
    ? task.acceptance.map((item) => `  - ${item}`).join('\n')
    : '  - (none provided — do the minimal correct thing)';
  return `DIRECTIVE FROM THE USER (CEO):
${task.directiveText}

YOUR TODO (${task.todoId}): ${task.title}
${task.description}

ACCEPTANCE CRITERIA:
${acceptance}

Begin. Respond with your first JSON action.`;
}
