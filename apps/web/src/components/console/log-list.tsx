/**
 * Path: apps/web/src/components/console/log-list.tsx
 * Purpose: Virtualized console log list (@tanstack/react-virtual) — renders
 * thousands of lines without breaking a sweat, sticks to the bottom unless
 * the user scrolled up.
 * Dependencies: @tanstack/react-virtual, @/lib/store, @/lib/utils
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LogEntry, LogLevel } from '@tagent-office/shared';
import { clockOf, cn } from '@/lib/utils';

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-zinc-500',
  info: 'text-zinc-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  debug: 'bg-zinc-800 text-zinc-400',
  info: 'bg-zinc-800 text-zinc-300',
  warn: 'bg-amber-500/15 text-amber-400',
  error: 'bg-red-500/15 text-red-400',
};

/** Virtualized scrolling log list. */
export function LogList({ logs }: { logs: LogEntry[] }): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

  useEffect(() => {
    if (stick && logs.length > 0) {
      virtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
    }
  }, [logs.length, stick, virtualizer]);

  function onScroll(): void {
    const element = parentRef.current;
    if (element === null) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    setStick(atBottom);
  }

  return (
    <div
      ref={parentRef}
      onScroll={onScroll}
      className="h-full min-h-0 overflow-y-auto font-mono text-[11px] leading-[22px]"
      aria-label="Office console log"
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const entry = logs[row.index];
          if (entry === undefined) return null;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
              className="flex items-baseline gap-2 px-3 whitespace-nowrap"
            >
              <span className="shrink-0 text-zinc-600">{clockOf(entry.ts)}</span>
              <span className={cn('shrink-0 rounded px-1 text-[10px] font-semibold uppercase', LEVEL_BADGE[entry.level])}>
                {entry.level}
              </span>
              <span className="shrink-0 max-w-[130px] truncate text-orange-400/70">{entry.source}</span>
              <span className={cn('truncate', LEVEL_CLASS[entry.level])} title={entry.message}>
                {entry.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
