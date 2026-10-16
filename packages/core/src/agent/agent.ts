/**
 * Path: packages/core/src/agent/agent.ts
 * Purpose: Agent — one worker brain. Binds a provider chain, a jailed tool
 *          registry, and the workspace root into a runnable that executes a
 *          single todo. Events stream out for the office console.
 * Dependencies: ./loop, ./prompt, ./context, ../providers/fallback,
 *              ../tools/registry, @tagent-office/shared
 */
import type { Logger, WorkerRole } from '@tagent-office/shared';
import { MAX_STEPS_PER_RUN } from '@tagent-office/shared';
import type { ProviderChain } from '../providers/fallback';
import type { ToolRegistry } from '../tools/registry';
import { buildContext } from './context';
import type { AgentEvent, AgentRunResult } from './loop';
import { runAgentLoop } from './loop';
import type { AgentTaskPromptInput } from './prompt';

/** Constructor options. */
export interface AgentOptions {
  workerId: string;
  role: WorkerRole;
  chain: ProviderChain;
  tools: ToolRegistry;
  workspaceRoot: string;
  maxSteps?: number;
  onEvent?: (event: AgentEvent) => void;
  logger?: Logger;
}

/** A runnable agent bound to a worker identity. */
export class Agent {
  private readonly options: AgentOptions;

  constructor(options: AgentOptions) {
    this.options = options;
  }

  /** Execute one todo and report the outcome. */
  async run(task: AgentTaskPromptInput, onRunEvent?: (event: AgentEvent) => void): Promise<AgentRunResult> {
    const messages = buildContext({
      workerId: this.options.workerId,
      role: this.options.role,
      workspaceRoot: this.options.workspaceRoot,
      tools: this.options.tools.list(),
      task,
    });

    this.options.logger?.info('agent run started', {
      workerId: this.options.workerId,
      todoId: task.todoId,
    });

    const mergedEvent = (event: AgentEvent): void => {
      this.options.onEvent?.(event);
      onRunEvent?.(event);
    };

    const result = await runAgentLoop({
      chat: (request) => this.options.chain.chat(request),
      systemPrompt: messages[0]?.content ?? '',
      taskPrompt: messages[1]?.content ?? '',
      executeTool: (tool, args) =>
        this.options.tools.execute(tool, args, {
          workspaceRoot: this.options.workspaceRoot,
          workerId: this.options.workerId,
          todoId: task.todoId,
        }),
      maxSteps: this.options.maxSteps ?? MAX_STEPS_PER_RUN,
      onEvent: mergedEvent,
    });

    this.options.logger?.info('agent run finished', {
      workerId: this.options.workerId,
      todoId: task.todoId,
      status: result.status,
      steps: result.steps.length,
    });

    return result;
  }
}
