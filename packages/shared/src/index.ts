/**
 * Path: packages/shared/src/index.ts
 * Purpose: Public barrel for @tagent-office/shared.
 *          Note: apps/web imports TYPES ONLY from this package; the runtime
 *          utilities are server-side (logger writes to stderr, config-loader
 *          reads the filesystem).
 * Dependencies: all sibling modules
 */
export * from './constants';
export * from './config-loader';
export * from './errors';
export * from './guards';
export * from './id';
export * from './logger';
export * from './result';
export * from './types';
