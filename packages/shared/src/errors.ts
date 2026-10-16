/**
 * Path: packages/shared/src/errors.ts
 * Purpose: Error hierarchy. Every expected failure carries a stable machine
 *          code; ProviderError knows whether fallback chains may retry it.
 * Dependencies: none
 */

/** Stable machine-readable codes for expected error families. */
export type TagentErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'PERMISSION'
  | 'PROVIDER'
  | 'CONFIGURATION'
  | 'INTERNAL';

/** Base class for all expected Tagent Office errors. */
export class TagentError extends Error {
  readonly code: TagentErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: TagentErrorCode, message: string, details?: Record<string, unknown>, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TagentError';
    this.code = code;
    this.details = details;
  }

  /** Structured fields for the JSON-lines logger. */
  toLogFields(): Record<string, unknown> {
    return { code: this.code, error: this.message, ...this.details };
  }
}

/** Invalid input (bad JSON body, failed type guard, out-of-range values). */
export class ValidationError extends TagentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', message, details);
    this.name = 'ValidationError';
  }
}

/** Requested entity does not exist. */
export class NotFoundError extends TagentError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} not found: ${id}`, { entity, id });
    this.name = 'NotFoundError';
  }
}

/** A permission system or file-jail rejection. */
export class PermissionError extends TagentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PERMISSION', message, details);
    this.name = 'PermissionError';
  }
}

/** Invalid configuration (missing provider, bad model ref, bad port). */
export class ConfigurationError extends TagentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFIGURATION', message, details);
    this.name = 'ConfigurationError';
  }
}

/**
 * LLM provider failure. `retryable` drives the fallback chain (PRD 2.15):
 * retryable = HTTP 429/5xx, timeout, malformed response, context length,
 * capability mismatch. User/tool/permission errors are never provider errors.
 */
export class ProviderError extends TagentError {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super('PROVIDER', message, { provider, status: options.status }, { cause: options.cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
