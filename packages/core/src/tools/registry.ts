/**
 * Path: packages/core/src/tools/registry.ts
 * Purpose: Tool registry with a permission gate. Every execution goes
 *          through here: lookup -> permission decision -> tool.execute.
 * Dependencies: ./types, ./read-file, ./write-file, ./bash,
 *              ../permissions/checker, @tagent-office/shared
 */
import { err, ok, type Logger, type Result } from '@tagent-office/shared';
import { PermissionError } from '@tagent-office/shared';
import type { PermissionChecker } from '../permissions/checker';
import { createBashTool } from './bash';
import { createReadFileTool } from './read-file';
import type { Tool, ToolExecutionContext, ToolResult } from './types';
import { createWriteFileTool } from './write-file';

/** Options for constructing a registry. */
export interface ToolRegistryOptions {
  checker: PermissionChecker;
  logger?: Logger;
  bashTimeoutMs?: number;
}

/** Owns the tool set and the permission gate. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(private readonly options: ToolRegistryOptions) {}

  /** Register a tool. Registering twice under one name is an error. */
  register(tool: Tool): Result<null, PermissionError> {
    if (this.tools.has(tool.name)) {
      return err(new PermissionError(`Tool already registered: ${tool.name}`));
    }
    this.tools.set(tool.name, tool);
    return ok(null);
  }

  /** Look up a tool by name. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** All registered tools (for prompt building). */
  list(): Tool[] {
    return [...this.tools.values()];
  }

  /**
   * Execute a tool call after the permission gate. Denials are returned as
   * failed ToolResults so the agent loop can observe and adapt.
   */
  async execute(name: string, args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      return { ok: false, output: `Unknown tool "${name}". Available: ${[...this.tools.keys()].join(', ')}` };
    }

    const outcome = this.options.checker.check(tool, args);
    if (outcome.decision === 'deny') {
      this.options.logger?.warn('permission denied', { tool: name, reason: outcome.reason });
      return { ok: false, output: `Permission denied for tool "${name}": ${outcome.reason}` };
    }
    if (outcome.decision === 'ask') {
      if (!this.options.checker.shouldAutoApproveAsk()) {
        this.options.logger?.warn('permission pending (auto-approve off)', { tool: name, reason: outcome.reason });
        return {
          ok: false,
          output: `Tool "${name}" requires approval that is not available in this session (auto-approve off).`,
        };
      }
      this.options.logger?.info('permission auto-approved (Phase 1 policy)', {
        tool: name,
        reason: outcome.reason,
      });
    }

    try {
      return await tool.execute(args, ctx);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, output: `Tool "${name}" crashed: ${message}` };
    }
  }
}

/** Create a registry pre-loaded with the Phase 1 builtin tools. */
export function createBuiltinToolRegistry(options: ToolRegistryOptions): ToolRegistry {
  const registry = new ToolRegistry(options);
  registry.register(createReadFileTool(options.logger));
  registry.register(createWriteFileTool(options.logger));
  registry.register(createBashTool({ timeoutMs: options.bashTimeoutMs, logger: options.logger }));
  return registry;
}
