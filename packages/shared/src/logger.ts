/**
 * Path: packages/shared/src/logger.ts
 * Purpose: Structured JSON-lines logger. Never console.log — records go to
 *          injectable sinks (stderr by default, ring buffer in the daemon).
 * Dependencies: ./types/log
 */
import type { LogLevel } from './types/log';

/** One structured log record; extra fields are spread at the top level. */
export type LogRecord = { ts: number; level: LogLevel; msg: string } & Record<string, unknown>;

/** Sink receives fully-formed records. */
export interface LogSink {
  write(record: LogRecord): void;
}

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Default sink: one JSON object per line on stderr. */
export function stderrSink(): LogSink {
  return {
    write(record: LogRecord): void {
      process.stderr.write(`${JSON.stringify(record)}\n`);
    },
  };
}

/** Bounded in-memory sink — the daemon uses it for the GUI snapshot. */
export function ringBufferSink(capacity: number): LogSink & { entries(): LogRecord[] } {
  const buffer: LogRecord[] = [];
  return {
    write(record: LogRecord): void {
      buffer.push(record);
      if (buffer.length > capacity) buffer.shift();
    },
    entries(): LogRecord[] {
      return [...buffer];
    },
  };
}

/** Test-friendly sink collecting every record. */
export function collectingSink(): LogSink & { records(): LogRecord[]; clear(): void } {
  const records_: LogRecord[] = [];
  return {
    write(record: LogRecord): void {
      records_.push(record);
    },
    records(): LogRecord[] {
      return [...records_];
    },
    clear(): void {
      records_.length = 0;
    },
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
  bindings?: Record<string, unknown>;
}

/** Structured logger with level filtering and child contexts. */
export class Logger {
  private readonly level: number;
  private readonly sink: LogSink;
  private readonly bindings: Record<string, unknown>;

  constructor(options: LoggerOptions = {}) {
    this.level = LEVEL_ORDER[options.level ?? 'info'];
    this.sink = options.sink ?? stderrSink();
    this.bindings = { ...options.bindings };
  }

  /** Derive a logger with additional permanent fields. */
  child(bindings: Record<string, unknown>): Logger {
    return new Logger({
      level: Object.keys(LEVEL_ORDER).find((key) => LEVEL_ORDER[key as LogLevel] === this.level) as LogLevel,
      sink: this.sink,
      bindings: { ...this.bindings, ...bindings },
    });
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.log('debug', msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.log('info', msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.log('warn', msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.log('error', msg, fields);
  }

  private log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.level) return;
    this.sink.write({ ts: Date.now(), level, msg, ...this.bindings, ...fields });
  }
}

/** Create a root logger. */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}
