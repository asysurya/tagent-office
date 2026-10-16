# @tagent-office/core

Agent engine: everything an agent needs to think and act.

- **Agent loop** (`src/agent`) — portable think → act → observe loop over any provider. The model speaks a strict JSON action protocol (one action per turn), which works on every OpenAI-compatible endpoint — including models without native tool-calling.
- **Tools** (`src/tools`) — `read_file`, `write_file`, `bash`. Every path is validated by the **file jail** (logical validation *before* parent dirs are created — no traversal outside the workspace root). Bash runs behind the **blocklist** (`rm -rf /`, `curl | bash`, fork bombs, ...).
- **Providers** (`src/providers`) — one generic `openai-compatible` adapter (configurable `baseURL` — Groq, Ollama, OpenRouter, ...), a thin OpenAI factory on top of it, and a `MockProvider` that behaves like an LLM (derives its next action from the conversation, not a canned script). `ProviderChain` implements the 3-layer fallback: multi-key → downgrade → cross-provider.
- **Permissions** (`src/permissions`) — safe / normal / krusial levels with config overrides.

## Usage

```ts
import { Agent, ToolRegistry, MockProvider, ProviderChain, PermissionChecker } from '@tagent-office/core';
```

## Test

```bash
bun test             # repo root
```
