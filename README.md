# Tagent Office

> Your AI team, in your browser.

A self-hosted app that runs an AI agent team like a real office: a **Manager** plans, **Workers** build, QA checks (Phase 6), and you — the CEO — just give directives. Everything is monitored through the GUI in real time. No data leaves your machine except the LLM API calls to the provider **you** choose.

- **Runtime**: Bun (>= 1.1) · **Backend**: Hono + socket.io v4 (one port) · **GUI**: Next.js 15 + React 19
- **Storage**: SQLite (bun:sqlite, WAL) — the full PRD 2.25 schema
- **License**: MIT © asysurya

## Status

**Phase 1 — Foundation: complete.** (Roadmap: 1 Foundation · 2 Source Panel · 3 Office 2D · 4 Orchestrator full · 5 Preview · 6 Vision · 7 Memory · 8 Settings · 9 Office 3D · 10 Binary & Release · 11 Landing · 12 Polish)

## Quick start

```bash
bun install          # install workspaces
bun run typecheck    # 0 errors (strict mode, no `any`)
bun run lint         # 0 warnings
bun test             # 203 tests, 0 fail — includes the full mock-provider E2E
bun run dev          # daemon :4020 + GUI :3000
```

Open **http://localhost:3000**, type a directive:

```
Create a hello.txt file with content 'hello world'
```

and watch the Manager break it into a todo, worker FE-01 claim it, `write_file` hit the disk (`storage/workspaces/demo/hello.txt`), and the console stream every step — all with the built-in **mock provider**, zero keys required.

### Use a real LLM (any OpenAI-compatible endpoint)

```bash
export TAGENT_OFFICE_BASE_URL=https://api.groq.com/openai/v1
export TAGENT_OFFICE_API_KEY=your-key
export TAGENT_OFFICE_MODEL=llama-3.3-70b-versatile
bun run dev
```

Works the same with OpenAI, Ollama (`http://localhost:11434/v1`), OpenRouter, LM Studio, vLLM — one generic adapter covers them all. Full reference: [docs/configuration.md](docs/configuration.md).

### CLI

```bash
bun packages/cli/src/index.ts start demo --port 4020
```

## What Phase 1 gives you

| Capability | Where |
|---|---|
| Typed domain model, Result-based errors, structured JSON logging | `packages/shared` |
| Agent engine: think → act → observe, portable JSON actions | `packages/core` |
| Jailed tools: `read_file`, `write_file`, `bash` (blocklisted, timeout-guarded) | `packages/core/src/tools` |
| Provider layer: generic openai-compatible + OpenAI + LLM-like mock, 3-layer fallback | `packages/core/src/providers` |
| SQLite store (PRD schema), priority queue, worker pool w/ heartbeats + watchdog | `packages/orchestrator` |
| SimpleManager: intake loop (breakdown / clarification) + execution loop | `packages/orchestrator/src/manager` |
| Daemon: Hono REST + socket.io on one port (`/socket.io`), client-driven snapshots | `packages/daemon` |
| CLI (`tagent-office start`), vision + memory stubs with frozen APIs | `packages/{cli,vision,memory}` |
| Dark GUI: directive inbox, todo queue, agent cards, realtime virtualized console | `apps/web` |

## Repository layout

```
packages/   shared · core · orchestrator · daemon · cli · vision (stub) · memory (stub)
apps/       web (Next.js 15 GUI) · landing (stub)
docs/       architecture.md · configuration.md
storage/    sqlite db + agent workspaces (runtime data, gitignored)
scripts/    dev.ts (daemon + GUI together)
.github/    ci.yml · release.yml (Phase 10 scaffold)
```

## Design commitments

1. **Standard socket.io** — `new Server(httpServer, { path: '/socket.io' })`, one port. No sandbox patterns.
2. **SQLite discipline** — positional `?` parameters only; the column is `commit_hash`, never `commit`.
3. **File jail first** — paths validate logically *before* parent dirs are created; traversal and symlink escapes are denied.
4. **Bash blocklist** — `rm -rf /`, `curl | bash`, fork bombs, `mkfs`, and friends never reach a shell.
5. **No hardcoded keys** — config file + env only; `${ENV_VAR}` references supported; the config API always redacts.
6. **Workers never die silently** — errors are caught, todos retry (max 3), heartbeats are watched, dead workers respawn under the same id.
7. **The daemon is standalone** — no supervisor loop; SIGINT drains cleanly.

See [docs/architecture.md](docs/architecture.md) for the deep dive.
