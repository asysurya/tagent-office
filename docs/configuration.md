# Tagent Office — Configuration Reference

## Precedence (PRD 2.21)

```
defaults  <  tagent-office.config.json  <  TAGENT_OFFICE_* env vars  <  CLI flags
```

Every value can always be overridden; nothing is hardcoded (no keys in code, ever).

## 1. Quick start: any OpenAI-compatible endpoint

```bash
# Groq
export TAGENT_OFFICE_BASE_URL=https://api.groq.com/openai/v1
export TAGENT_OFFICE_API_KEY=gsk_...
export TAGENT_OFFICE_MODEL=llama-3.3-70b-versatile

# Ollama (local)
export TAGENT_OFFICE_BASE_URL=http://localhost:11434/v1
export TAGENT_OFFICE_API_KEY=ollama
export TAGENT_OFFICE_MODEL=qwen2.5-coder:7b

# OpenAI native
export TAGENT_OFFICE_BASE_URL=https://api.openai.com/v1
export TAGENT_OFFICE_API_KEY=sk-...
export TAGENT_OFFICE_MODEL=gpt-4o-mini
```

Setting `TAGENT_OFFICE_BASE_URL` registers a `custom` openai-compatible provider and makes it the default for every role. **One adapter covers every provider** — there is deliberately no per-provider code (PRD 2.20).

Without any env, the office runs on the **mock provider** — fully functional for demos and tests, zero keys.

## 2. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `TAGENT_OFFICE_CONFIG` | `./tagent-office.config.json` | Config file path |
| `TAGENT_OFFICE_PORT` | `4020` | Daemon HTTP + WS port |
| `TAGENT_OFFICE_STORAGE` | `./storage` | Storage root (SQLite + workspaces) |
| `TAGENT_OFFICE_WORKSPACE` | `demo` | Workspace name agents operate in |
| `TAGENT_OFFICE_PROVIDER` | `mock` | Default provider id |
| `TAGENT_OFFICE_MODEL` | `mock-echo-1` | Default model (with `PROVIDER`) |
| `TAGENT_OFFICE_BASE_URL` | — | Registers the `custom` openai-compatible provider |
| `TAGENT_OFFICE_API_KEY` | — | Key for the custom/default provider |
| `TAGENT_OFFICE_MAX_WORKERS` | `4` | Concurrent worker cap |
| `TAGENT_OFFICE_TELEMETRY` | `false` | Telemetry is OFF, always (PRD 2.24 #12) |

Web GUI (build-time):

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_DAEMON_URL` | `http://localhost:4020` | Direct daemon URL (standard `/socket.io`) |
| `NEXT_PUBLIC_DAEMON_URL` (empty) | — | Same-origin proxy mode (`/api/tagent/*`, `/tagent-socket/*` rewrites) |
| `DAEMON_PROXY_TARGET` | `http://127.0.0.1:4020` | Server-side target of those rewrites |

## 3. Config file (tagent-office.config.json)

```json
{
  "version": "1.0.0",
  "port": 4020,
  "storage": "./storage",
  "workspace": "demo",
  "telemetry": false,
  "autoUpdate": true,
  "defaultProvider": "groq",
  "defaultModel": "llama-3.3-70b-versatile",
  "providers": {
    "openai": {
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "models": ["gpt-4o-mini"]
    },
    "groq": {
      "type": "openai-compatible",
      "baseURL": "https://api.groq.com/openai/v1",
      "apiKey": "${GROQ_API_KEY}",
      "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    },
    "ollama": {
      "type": "openai-compatible",
      "baseURL": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "models": ["qwen2.5-coder:7b"],
      "capabilities": { "tools": true }
    }
  },
  "roles": {
    "manager":   { "primary": "groq/llama-3.3-70b-versatile", "fallbacks": ["groq/llama-3.1-8b-instant", "openai/gpt-4o-mini"] },
    "frontend":  { "primary": "groq/llama-3.3-70b-versatile", "fallbacks": [] },
    "backend":   { "primary": "groq/llama-3.3-70b-versatile", "fallbacks": [] },
    "qa":        { "primary": "groq/llama-3.3-70b-versatile", "fallbacks": [] },
    "vision":    { "primary": "mock/mock-echo-1", "fallbacks": [] }
  },
  "permissions": {
    "tools": { "read_file": "allow", "write_file": "allow", "bash": "allow" },
    "autoApproveAsk": true
  },
  "performance": {
    "tier": "auto",
    "maxWorkers": 4,
    "maxQA": 2,
    "workerRoles": ["frontend", "backend"]
  }
}
```

Notes:

- `"${ENV_VAR}"` references resolve at load time; a missing variable is a loud `ConfigurationError`. A fallback default can be written as `"${VAR:-default}"`.
- Model references are always `"provider/model"` (first slash splits — model names may contain slashes).
- `roles.*.fallbacks` implement the 3 layers of PRD 2.15: multi-key (same provider, different key entry), downgrade (cheaper model of the same provider), cross-provider. Order is yours.
- `permissions.autoApproveAsk: true` is the Phase 1 policy that auto-approves "ask" tools with a logged decision; the real approval queue arrives in Phase 4.

## 4. API (port 4020)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + counters |
| GET / PUT | `/api/config` | Read (redacted) / patch permissions + performance |
| GET | `/api/directives` | Directive inbox |
| POST | `/api/directives` | Submit `{ "text": "..." }` → 202 |
| GET | `/api/directives/:id` | Directive + its todos |
| GET | `/api/todos?status=&directive=` | Todo queue |
| GET | `/api/todos/:id` | Todo + audit events |
| GET | `/api/workers` | Worker roster |
| POST | `/api/workers` | `{ "role": "frontend", "count": 1 }` spawn |
| POST | `/api/workers/:id/stop` | Stop one worker |

WebSocket (socket.io, path `/socket.io`): connect → emit `request:snapshot` → receive `snapshot`, then live `office:*` / `console:*` events.

## 5. Performance tiers (PRD 2.22)

| Tier | RAM | Max Worker | Max QA | 3D Quality | FPS |
|---|---|---|---|---|---|
| potato | 2 GB | 2 | 1 | 2D card grid | 2 |
| low | 4 GB | 3 | 1 | 3D low-poly | 5 |
| medium | 6–8 GB | 4 | 2 | 3D + shadow | 15 |
| high | 12–16 GB | 8 | 2 | 3D + post-fx | 30 |
| ultra | 32+ GB | 16+ | 4 | 3D + ray tracing | 60 |

Phase 1 enforces `maxWorkers` / `maxQA`; the tier auto-detection and 3D quality mapping land with the Office 2D/3D phases.

## 6. CLI

```bash
tagent-office start demo --port 4020 --storage ./storage --config ./tagent-office.config.json --log-level info
```

Flags beat env, env beats file, file beats defaults. Exit codes: `0` clean, `1` usage, `2` boot failure.
