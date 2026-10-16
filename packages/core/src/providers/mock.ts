/**
 * Path: packages/core/src/providers/mock.ts
 * Purpose: MockProvider that BEHAVES like an LLM (anti-pattern #11): it
 *          inspects the conversation — system markers, the task text, and
 *          prior OBSERVATION turns — and derives the next action from that
 *          state. No canned replay script.
 *
 *          Recognized flows:
 *          - Manager breakdown prompts (TAGENT-MANAGER-BREAKDOWN marker):
 *            parses file-creation / list-files directives into TodoDrafts.
 *          - Worker prompts (TAGENT-WORKER marker): drives the JSON action
 *            protocol — write_file for file tasks, bash for listing, finish
 *            once the observation stream shows the work is done.
 * Dependencies: ./types, @tagent-office/shared
 */
import { ok, type ProviderError, type Result } from '@tagent-office/shared';
import type { ChatRequest, ChatResponse, ProviderAdapter } from './types';

/** Marker the manager breakdown system prompt must contain. */
export const MANAGER_BREAKDOWN_MARKER = 'TAGENT-MANAGER-BREAKDOWN';
/** Marker the worker system prompt must contain. */
export const WORKER_MARKER = 'TAGENT-WORKER';

/** Parsed file-creation intent. */
interface FileIntent {
  path: string;
  content: string;
}

const FILE_INTENT_PATTERN =
  /(?:create|make|write)\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?(?:named\s+|called\s+)?["']?([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]+)["']?(?:\s+file)?\s+(?:with\s+)?(?:the\s+)?content\s+["'](.+?)["']/i;

const LIST_INTENT_PATTERN = /\blist\s+(?:the\s+)?(?:all\s+)?files?\b/i;

/** Parse a file-creation intent from free text. */
export function parseFileIntent(text: string): FileIntent | null {
  const match = FILE_INTENT_PATTERN.exec(text);
  if (match === null) return null;
  return { path: match[1] ?? '', content: match[2] ?? '' };
}

/** A single todo draft as a record (NOT a JSON string). */
function draft(title: string, description: string, acceptance: string[], role: string): Record<string, unknown> {
  return {
    title,
    description,
    type: 'feature',
    role,
    category: 'normal',
    acceptance,
    testScenarios: [],
    requiresQA: false,
  };
}

/** Produce a manager breakdown answer for a directive text. */
function managerBreakdown(directive: string): string {
  const fileIntent = parseFileIntent(directive);
  if (fileIntent !== null) {
    return JSON.stringify({
      confidence: 0.95,
      notes: `Single-file directive: create ${fileIntent.path}.`,
      todos: [
        draft(
          `Create ${fileIntent.path}`,
          `Create the file ${fileIntent.path} with the exact content "${fileIntent.content}".`,
          [`File ${fileIntent.path} exists with the exact requested content`],
          'frontend',
        ),
      ],
    });
  }
  if (LIST_INTENT_PATTERN.test(directive)) {
    return JSON.stringify({
      confidence: 0.9,
      notes: 'Listing task.',
      todos: [
        draft(
          'List workspace files',
          'List the files currently present in the workspace root using bash and report the result.',
          ['A file listing is produced'],
          'any',
        ),
      ],
    });
  }
  // Ambiguous directive — low confidence triggers a clarification (PRD 2.14).
  return JSON.stringify({
    confidence: 0.5,
    notes: 'Directive is ambiguous; clarification needed.',
    todos: [],
  });
}

/** Decide the next worker action from the conversation state. */
function workerAction(messages: ChatRequest['messages']): string {
  const firstUser = messages.find((message) => message.role === 'user');
  const task = firstUser?.content ?? '';
  const observations = messages
    .filter((message) => message.role === 'user' && message !== firstUser)
    .map((message) => message.content);

  const didWrite = observations.some((obs) => /Wrote \d+ bytes to /.test(obs));
  const didList = observations.some((obs) => /exit code: 0/.test(obs) && /stdout:/.test(obs));

  const fileIntent = parseFileIntent(task);
  if (fileIntent !== null) {
    if (didWrite) {
      return JSON.stringify({
        thought: `The file ${fileIntent.path} has been written successfully.`,
        action: { tool: 'finish', arguments: { summary: `Created ${fileIntent.path} with the requested content.` } },
      });
    }
    return JSON.stringify({
      thought: `I need to create ${fileIntent.path} with the requested content.`,
      action: { tool: 'write_file', arguments: { path: fileIntent.path, content: fileIntent.content } },
    });
  }

  if (LIST_INTENT_PATTERN.test(task)) {
    if (didList) {
      return JSON.stringify({
        thought: 'The listing has been produced.',
        action: { tool: 'finish', arguments: { summary: 'Listed workspace files.' } },
      });
    }
    return JSON.stringify({
      thought: 'I should list the files in the workspace.',
      action: { tool: 'bash', arguments: { command: 'ls -la' } },
    });
  }

  // Generic fallback: acknowledge and finish cleanly.
  return JSON.stringify({
    thought: 'No concrete file task detected; completing with a summary.',
    action: { tool: 'finish', arguments: { summary: 'No concrete file task detected in the directive.' } },
  });
}

/**
 * The mock provider — an offline LLM for tests and zero-key development.
 * Deterministic, conversation-state-driven, never a blind replay.
 */
export class MockProvider implements ProviderAdapter {
  readonly name = 'mock';
  readonly defaultModel = 'mock-echo-1';

  async chat(request: ChatRequest): Promise<Result<ChatResponse, ProviderError>> {
    const system = request.messages.find((message) => message.role === 'system')?.content ?? '';
    const content = system.includes(MANAGER_BREAKDOWN_MARKER)
      ? managerBreakdown(lastUserText(request))
      : workerAction(request.messages);
    return ok({
      content,
      model: request.model ?? this.defaultModel,
      usage: { inputTokens: 64, outputTokens: 96 },
      finishReason: 'stop',
    });
  }
}

function lastUserText(request: ChatRequest): string {
  const last = [...request.messages].reverse().find((message) => message.role === 'user');
  return last?.content ?? '';
}
