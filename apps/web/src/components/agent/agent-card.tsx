/**
 * Path: apps/web/src/components/agent/agent-card.tsx
 * Purpose: AgentCard — one card per worker: identity, role, live state with
 *          a pulse while working, current todo, and heartbeat freshness.
 * Dependencies: @tanstack/react-query, ui/badge, ui/card, @/lib/api, @/lib/utils
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import type { WorkerInfo, WorkerState } from '@tagent-office/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchWorkers } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';

const STATE_VARIANT: Record<WorkerState, 'default' | 'secondary' | 'success' | 'warn' | 'danger'> = {
  init: 'secondary',
  idle: 'secondary',
  working: 'default',
  stopping: 'warn',
  dead: 'danger',
};

function initials(worker: WorkerInfo): string {
  return worker.id.slice(0, 2).toUpperCase();
}

/** One worker card. */
function AgentCardItem({ worker }: { worker: WorkerInfo }): React.JSX.Element {
  const working = worker.state === 'working';
  return (
    <div
      className={cn(
        'flex min-w-[220px] flex-1 flex-col gap-2 rounded-xl border p-3',
        working ? 'border-orange-500/50 bg-orange-500/[0.06]' : 'border-zinc-800 bg-zinc-900/60',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold',
            working ? 'bg-orange-500 text-zinc-950 tagent-working' : 'bg-zinc-800 text-zinc-400',
          )}
        >
          {initials(worker)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-semibold text-zinc-200">{worker.id}</p>
          <p className="text-[11px] text-zinc-500">{worker.role}</p>
        </div>
        <Badge variant={STATE_VARIANT[worker.state]}>{worker.state}</Badge>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
        <p className="truncate">
          {worker.currentTodoId !== null ? (
            <>
              working on <span className="font-mono text-zinc-300">{worker.currentTodoId}</span>
            </>
          ) : (
            'waiting for todos'
          )}
        </p>
        <p>heartbeat {timeAgo(worker.lastHeartbeat)}</p>
      </div>
    </div>
  );
}

/** The agent roster. */
export function AgentCard(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: fetchWorkers,
    refetchInterval: 5_000,
  });
  const workers = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agents</CardTitle>
        <CardDescription>
          {workers.length} worker{workers.length === 1 ? '' : 's'} — pull-based, heartbeat every 5s
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : workers.length === 0 ? (
          <p className="text-xs text-zinc-500">No workers running.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {workers.map((worker) => (
              <AgentCardItem key={worker.id} worker={worker} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
