# @tagent-office/shared

Shared foundation for all Tagent Office packages: domain types, the `Result<T, E>` type, error classes, a JSON-lines structured logger, the ID generator (`T-001`, `dir-001`, `FE-01`, ...), constants from the PRD, and the config loader (JSON file + `TAGENT_OFFICE_*` env overrides — env always wins).

Browser-safe by design: `apps/web` imports **types only** from this package; the runtime utilities (`logger`, `config-loader`, `id`) are server-side.

## Usage

```ts
import { type Todo, ok, err, isErr, createLogger, IdGenerator, loadConfig } from '@tagent-office/shared';

const logger = createLogger({ level: 'info' }).child({ mod: 'demo' });
const result = ok<Todo, Error>(todo);
```

## Test

```bash
bun test            # from repo root (discovers all workspaces)
bun run --filter '@tagent-office/shared' test
```
