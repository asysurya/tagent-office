# @tagent-office/daemon

The office front door: one Hono HTTP server + one socket.io v4 server, on ONE port (default 4020), standard `/socket.io` path.

- **`bootDaemon()` / `src/index.ts`** — standalone entry (`bun packages/daemon/src/index.ts`). No supervisor loop, no auto-restart magic: SIGINT/SIGTERM drain workers, requeue in-flight todos, close the store.
- **`src/runtime.ts`** — wires storage, store, bus + console ring, provider chains per role, worker pool (Agent factory included), SimpleManager. Builds the GUI snapshot.
- **`src/socket.ts`** — realtime bridge. Clients send `request:snapshot` after connecting; the server answers once, then streams every `office:*` / `console:*` event.
- **Routes** — `GET /api/health`, `GET|PUT /api/config` (keys redacted — always), `GET|POST /api/directives`, `GET /api/todos[/:id]`, `GET|POST /api/workers`, `POST /api/workers/:id/stop`.
- **Middleware** — structured request logging and a central error handler mapping `TagentError` codes to honest HTTP statuses.

## Run

```bash
bun packages/daemon/src/index.ts            # standalone
bun packages/cli/src/index.ts start demo    # via the CLI
bun run dev                                 # daemon + web GUI together
```

## Test

```bash
bun test   # includes the full mock-provider E2E (hello.txt on disk)
```
