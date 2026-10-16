# @tagent-office/web

The office GUI — Next.js 15 (App Router) + React 19.

- **Dark zinc + orange** design language (PRD 2.8), Inter for UI, JetBrains Mono for code (CSS font stacks — no build-time font downloads).
- **Realtime**: socket.io-client talks to the daemon on the standard `/socket.io` path. After connecting, the client sends `request:snapshot` and the server answers with full state (anti-pattern #8), then streams `office:*` / `console:*` events.
- **State split** (PRD 2.6): TanStack Query owns server state (todos, directives, workers, health — invalidated by socket events); Zustand owns realtime client state (connection, console ring).
- **Components**: TopNav, SplitView, DirectiveInput, DirectiveInbox, TodoList, AgentCard, ConsolePanel + virtualized LogList (@tanstack/react-virtual).

## Daemon URL modes

| Mode | Set | Effect |
|---|---|---|
| Direct (default) | `NEXT_PUBLIC_DAEMON_URL=http://localhost:4020` | browser talks straight to the daemon |
| Same-origin proxy | `NEXT_PUBLIC_DAEMON_URL=` (empty) | requests go to `/api/tagent/*` + `/tagent-socket/*`, rewritten by `next.config.ts` (embedded binary / reverse proxy / hosted preview) |

## Run

```bash
bun run dev   # from repo root (daemon :4020 + GUI :3000)
```
