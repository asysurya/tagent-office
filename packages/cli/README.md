# @tagent-office/cli

The `tagent-office` binary entry point (Phase 10 compiles it into standalone binaries).

```bash
tagent-office start [workspace] [options]
```

- `start demo` — boot storage + the daemon in-process, on the configured port.
- Flags: `--port`, `--storage`, `--config`, `--log-level`.
- Flags beat env, env beats the config file, the config file beats defaults (see docs/configuration.md).
- Exit codes: `0` clean, `1` usage error, `2` boot failure.

The daemon runs standalone — no supervisor loop (anti-pattern #9). SIGINT/SIGTERM drains workers, requeues in-flight todos, and closes the store cleanly.
