/**
 * Path: apps/web/src/lib/utils.ts
 * Purpose: Small shared helpers (cn for class merging).
 * Dependencies: clsx, tailwind-merge
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Relative "x ago" for heartbeats and timestamps. */
export function timeAgo(ts: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** HH:MM:SS for console lines. */
export function clockOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}
