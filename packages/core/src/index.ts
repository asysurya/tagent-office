/**
 * Path: packages/core/src/index.ts
 * Purpose: Public barrel for @tagent-office/core.
 * Dependencies: all sibling modules
 */

// Agent engine
export { Agent, type AgentOptions } from './agent/agent';
export { buildContext } from './agent/context';
export {
  parseAgentMessage,
  runAgentLoop,
  type AgentEvent,
  type AgentLoopDeps,
  type AgentRunResult,
  type AgentStep,
  type ParsedAgentMessage,
} from './agent/loop';
export {
  buildManagerBreakdownSystemPrompt,
  buildTaskPrompt,
  buildWorkerSystemPrompt,
  type AgentTaskPromptInput,
  type WorkerSystemPromptOptions,
} from './agent/prompt';

// Permissions
export { PermissionChecker, type PermissionOutcome } from './permissions/checker';
export { RISK_DEFAULT_DECISION, RISK_DESCRIPTION } from './permissions/levels';

// Providers
export { ProviderChain, buildChain, type ChainStep, type OnFallback } from './providers/fallback';
export { MockProvider, MANAGER_BREAKDOWN_MARKER, WORKER_MARKER, parseFileIntent } from './providers/mock';
export { createOpenAIProvider, OPENAI_API_BASE_URL } from './providers/openai';
export { OpenAICompatibleAdapter, type OpenAICompatOptions } from './providers/openai-compat';
export { ProviderRegistry, buildProviderRegistry } from './providers/registry';
export {
  parseModelRef,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ChatUsage,
  type ModelRef,
  type ProviderAdapter,
} from './providers/types';

// Tools
export { BASH_BLOCKLIST, checkBashCommand, findBlockedRule, type BlockRule } from './tools/blocklist';
export { createBashTool } from './tools/bash';
export { ensureParentDir, resolveJailedPath, type JailedPath } from './tools/jail';
export { createReadFileTool } from './tools/read-file';
export { ToolRegistry, createBuiltinToolRegistry, type ToolRegistryOptions } from './tools/registry';
export {
  isRecord as isToolRecord,
  requireString,
  type BuiltinToolName,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
  type ToolRiskLevel,
} from './tools/types';
export { createWriteFileTool } from './tools/write-file';
