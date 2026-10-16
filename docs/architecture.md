# Tagent Office — Architecture

> Your AI team, in your browser. Self-hosted; your keys never leave your machine.

This document describes the Phase 1 (Foundation) architecture. It is the contract the later phases (Source Panel, Office 2D/3D, Preview, Vision, Memory, Settings, Binary) build on.

## 1. Bird's-eye view

```
                        github.com/asysurya/tagent-office
                        ┌────────────────────────────────────────────┐
                        │  Bun workspaces monorepo                    │
                        │                                            │
  USER (CEO) ──HTTP──►  │  ┌──────────────────────────────┐           │
  browser GUI :3000    │  │  daemon :4020                 │           │
  (Next.js 15)         │  │  Hono REST  +  socket.io v4   │           │
        │              │  │  (ONE port, path /socket.io) │           │
        │  WebSocket    │  └───────┬──────────────────────┘           │
        └──────────────────────►  │                                  │
                                 ▼                                  │
                        ┌───────────────────────┐                    │
                        │  runtime (daemon)     │                    │
                        │  ┌─────────────────┐  │                    │
                        │  │ SimpleManager   │  │  intake + exec     │
                        │  └───┬─────────┬───┘  │                    │
                        │      │         │      │                    │
                        │  breakdown    execution tick                │
                        │      │         │      │                    │
                        │  ┌───▼─────────▼───┐  │                    │
                        │  │  WorkerPool     │  │  FE-01, BE-01, …  │
                        │  │  (pull model)   │  │  heartbeat 5s      │
                        │  └───┬─────────────┘  │                    │
                        │      │ Agent (core)  │                    │
                        │      │ think→act→    │                    │
                        │      │ observe loop   │                    │
                        │  ┌───▼─────────────┐  │                    │
                        │  │ Tools (jailed)  │  │  read_file        │
                        │  │ + permissions   │  │  write_file       │
                        │  └─────────────────┘  │  bash (blocklist) │
                        │  ┌─────────────────┐  │                    │
                        │  │ SqliteStore      │  │  storage/sqlite   │
                        │  │ (bun:sqlite WAL) │  │  tagent.db        │
                        │  └─────────────────┘  │                    │
                        └───────────────────────┘                    │
                                     │                               │
                                     ▼                               │
                        storage/workspaces/<name>/  ← agent file jail │
                        └────────────────────────────────────────────┘
```

## 2. Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@tagent-office/shared` | Domain types (PRD 2.10–2.17), `Result<T, E>`, error hierarchy, JSON-lines logger, ID generator (`T-001`, `FE-01`, …), constants, config loader (JSON ← env) | — |
| `@tagent-office/core` | Agent engine: think→act→observe loop, jailed tools, bash blocklist, permission system, provider adapters (one generic openai-compatible + OpenAI factory + LLM-like mock), 3-layer fallback chains | shared |
| `@tagent-office/orchestrator` | SQLite store (PRD 2.25 schema), priority queue (PRD 2.11), workers + pool with heartbeats, SimpleManager dual loop, typed event bus | shared, core |
| `@tagent-office/daemon` | Hono HTTP + socket.io v4 on ONE port, routes, middleware, console ring + snapshot, runtime wiring | shared, core, orchestrator |
| `@tagent-office/cli` | `tagent-office start <workspace>` — bootstrap + in-process daemon | shared, daemon |
| `@tagent-office/vision` | STUB (Phase 6) — API frozen per PRD 2.16 | shared |
| `@tagent-office/memory` | STUB (Phase 7) — API frozen per PRD 2.17; salience math shipped | shared |
| `apps/web` | Next.js 15 GUI: directive inbox, todo queue, agent cards, realtime console | shared |
| `apps/landing` | STUB (Phase 11) | — |

## 3. The agent protocol (portable JSON actions)

Every worker speaks one strict protocol that works on **any** OpenAI-compatible endpoint — including models without native tool-calling. The system prompt (see `core/src/agent/prompt.ts`) instructs the model to answer with exactly one JSON object per turn:

```json
{"thought": "one short sentence", "action": {"tool": "write_file", "arguments": {"path": "hello.txt", "content": "hello world"}}}
```

or

```json
{"thought": "done — the file exists", "action": {"tool": "finish", "arguments": {"summary": "Created hello.txt"}}}
```

The loop (`core/src/agent/loop.ts`):

1. **think** — provider chain chat with the running message history
2. **parse** — tolerate code fences/prose, then strict type guards; malformed responses get corrective feedback; after 3 in a row the run fails as a retryable provider error (fallback chain territory)
3. **act** — execute the tool through the permission gate
4. **observe** — append `OBSERVATION (step N): …` and loop

Runs cap at `MAX_STEPS_PER_RUN` (15). Every step streams `office:agent.progress|tool_call|tool_result` events with the worker and todo id.

## 4. Providers (PRD 2.15, 2.20)

- **One adapter**: `OpenAICompatibleAdapter` (configurable `baseURL`) serves `openai`, `openai-compatible` (Groq, Ollama, OpenRouter, LM Studio, vLLM), everything speaking `/chat/completions`. `openai.ts` is a thin factory pointing the same adapter at `https://api.openai.com/v1`. There is deliberately **no** per-provider adapter.
- **Fallback chains**: `[primary, ...fallbacks]` per role. Retryable errors (HTTP 429/5xx, timeout, malformed JSON, context length) fall through; fatal errors (4xx auth) stop immediately; user/tool/permission errors are never provider errors.
- **MockProvider** behaves like an LLM: it inspects the conversation (system markers + task + prior observations) and derives the next action — it is not a canned replay (anti-pattern #11). This is what makes the Phase 1 E2E honest with zero keys.

## 5. Orchestration (PRD 2.12–2.13)

- **Workers** are pull actors with an infinite loop: claim → execute → report → repeat. Errors never break the loop. Heartbeat every 5 s; idle workers poll every 500 ms. State: `INIT → IDLE ⇄ WORKING → STOPPING → DEAD`.
- **WorkerPool** spawns N workers per role (`performance.workerRoles`, default `frontend` + `backend`, cap `maxWorkers`). Boot requeues stale `assigned`/`in_progress` todos (resume-safe). The watchdog marks a worker dead after 15 s of silence, requeues its todo, and respawns under the same persistent id.
- **SimpleManager** runs two loops:
  - *Intake* (event-driven): `receiveDirective` → LLM breakdown → todos (or a Clarification below the 0.85 confidence threshold, PRD 2.14).
  - *Execution* (1 s tick): priority recalculation (aging, blocks, deps-satisfied), Phase 1 QA auto-pass for `ready_for_test` (real QA lands in Phase 6), directive completion into **iteration logs** (PRD 2.17), pool watchdog.
- **Priority model** (PRD 2.11): base per type (bug 70, feature 60, investigate/test 50, refactor 40, chore 30; bug+critical 95; feature+critical 80) + blocks (+20/+10) + aging (+2/min, cap +20) + deps satisfied (+15) + user boost (+30) + bug (+10), clamped to [0, 100].
- **Atomic claims**: `UPDATE todos SET status='assigned', assignee=? WHERE id=? AND status='pending'` — two workers can never take the same todo.

## 6. Persistence (PRD 2.25)

`bun:sqlite`, WAL mode, **positional `?` parameters only**, column `commit_hash` (never `commit` — reserved keyword). Tables: `todos`, `todo_events`, `directives`, `iterations`, `clarifications`, `workers`, `memories` (+ `PRAGMA user_version` schema versioning). Arrays/objects are JSON text. Layout:

```
storage/
├── sqlite/tagent.db
└── workspaces/<name>/     ← the agent file jail root
```

## 7. Daemon (ports, PRD 2.27)

- **4020** — HTTP API + socket.io v4, single node http server, standard `/socket.io` path (anti-pattern #1: never a sandbox `?XTransformPort` pattern).
- 4021–4023+ — preview servers (Phase 5).
- Routes: `GET /api/health`, `GET|PUT /api/config` (keys always redacted), `GET|POST /api/directives`, `GET /api/directives/:id`, `GET /api/todos[/:id]`, `GET|POST /api/workers`, `POST /api/workers/:id/stop`.
- Realtime: clients emit `request:snapshot` **after** connecting; the server answers once with full state, then streams `office:*` / `console:*` events (anti-pattern #8).
- The daemon runs standalone — no supervisor loop (anti-pattern #9). SIGINT/SIGTERM drains workers and closes the store.

## 8. GUI (apps/web)

- Next.js 15 App Router + React 19, dark zinc-950 + orange accents (PRD 2.8), Inter/JetBrains Mono via CSS font stacks (no build-time font downloads — offline-safe).
- State split (PRD 2.6): TanStack Query owns server state (todos/directives/workers/health, invalidated by socket events); Zustand owns realtime client state (connection, console ring, cap 500).
- Console is virtualized (@tanstack/react-virtual) and sticks to the bottom unless the user scrolls up.
- Daemon URL: `NEXT_PUBLIC_DAEMON_URL` (default `http://localhost:4020`, direct mode) or empty string for same-origin proxy mode (`/api/tagent/*` + `/tagent-socket/*` rewrites — for the embedded binary or reverse-proxy deployments).

## 9. Safety (PRD 2.19)

- **File jail**: every tool path resolves inside the workspace root; validation is logical and runs before parent-dir creation (anti-pattern #7). Symlink escapes are caught via best-effort realpath of the deepest existing ancestor.
- **Bash blocklist**: `rm -rf /`-family, `curl|bash` / `wget|sh`, fork bombs, `dd if=/dev/zero`, `mkfs`, shutdown/reboot, `chmod 777 /`, `chown -R` on absolute paths, raw-device writes, `kill -9 -1`. Blocklisted commands never reach a shell.
- **Permissions**: config `permissions.tools` (`allow|ask|deny`) over risk defaults (safe→allow, normal/krusial→ask). Phase 1 auto-approves `ask` with a logged decision (`autoApproveAsk`, default on) — the real approval queue arrives in Phase 4.
- **Bash timeouts** kill the process and abandon the pipes with a hard deadline so orphaned grandchildren cannot hang the tool.

## 10. Event catalog (PRD 2.26)

Namespaces on one typed `EventMap` (see `shared/src/types/events.ts`): `office:agent.*`, `office:todo.*`, `office:task.*`, `office:directive.*`, `office:clarification.*`, `office:iteration.*`, `office:worker.*`, `office:project.done`, `source:file.*` (Phase 2), `console:*`, `preview:*` (Phase 5). The daemon's wildcard tap mirrors `office:*` into human-readable console lines; the socket bridge forwards everything to connected clients.

## 11. What is deliberately NOT here (Phase 1 scope)

Source panel (Phase 2), Office 2D/3D (Phase 3), full orchestrator features like preemption/escalation flows (Phase 4), preview servers (Phase 5), vision (Phase 6), memory (Phase 7), settings dashboard (Phase 8), binary compilation (Phase 10), landing content (Phase 11). The stubs freeze their API surfaces so wiring never breaks.
