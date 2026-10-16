/**
 * Path: apps/web/src/components/layout/top-nav.tsx
 * Purpose: Top navigation — wordmark, tagline, live health dot, version,
 *          workspace name. Reflects socket connection + health polling.
 * Dependencies: @tanstack/react-query, @/lib/store, @/lib/api, ui/badge
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { fetchHealth } from '@/lib/api';
import { useOfficeStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/** App top bar. */
export function TopNav(): React.JSX.Element {
  const connection = useOfficeStore((state) => state.connection);
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5_000,
    retry: 1,
  });

  const online = connection === 'connected' && health.data?.status === 'ok';
  const dotClass = online
    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
    : connection === 'connecting'
      ? 'bg-amber-500'
      : 'bg-red-500';
  const label = online ? 'office online' : connection === 'connecting' ? 'connecting…' : 'office offline';

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:px-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-4 w-4 rounded-[4px] bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.55)]" />
          <span className="text-sm font-semibold tracking-tight text-zinc-100">Tagent Office</span>
          <span className="hidden text-xs text-zinc-500 sm:inline">— your AI team, in your browser</span>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {health.data !== undefined ? (
            <Badge variant="secondary" className="hidden normal-case sm:inline-flex">
              v{health.data.version}
            </Badge>
          ) : null}
          {health.data !== undefined ? (
            <Badge variant="outline" className="hidden normal-case md:inline-flex">
              workspace: {health.data.workspace}
            </Badge>
          ) : null}
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={cn('h-2 w-2 rounded-full transition-colors', dotClass)} aria-hidden />
            {label}
          </span>
        </div>
      </div>
    </header>
  );
}
