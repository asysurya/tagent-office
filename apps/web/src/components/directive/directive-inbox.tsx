/**
 * Path: apps/web/src/components/directive/directive-inbox.tsx
 * Purpose: Directive inbox — every directive the CEO sent, newest first,
 *          with status chips (queued / in progress / needs clarification /
 *          done).
 * Dependencies: @tanstack/react-query, ui/badge, ui/card, @/lib/api, @/lib/utils
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import type { DirectiveStatus } from '@tagent-office/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchDirectives } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

const STATUS_VARIANT: Record<DirectiveStatus, 'default' | 'secondary' | 'success' | 'warn' | 'info'> = {
  pending_clarification: 'warn',
  queued: 'info',
  in_progress: 'default',
  done: 'success',
  cancelled: 'secondary',
};

const STATUS_LABEL: Record<DirectiveStatus, string> = {
  pending_clarification: 'needs clarification',
  queued: 'queued',
  in_progress: 'in progress',
  done: 'done',
  cancelled: 'cancelled',
};

/** Inbox list. */
export function DirectiveInbox(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['directives'],
    queryFn: fetchDirectives,
    refetchInterval: 10_000,
  });
  const directives = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Directive inbox</CardTitle>
        <CardDescription>{directives.length} directive(s) — newest first</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : directives.length === 0 ? (
          <p className="text-xs text-zinc-500">No directives yet. Send one above.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {directives.map((directive) => (
              <li
                key={directive.id}
                className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5"
              >
                <Badge variant={STATUS_VARIANT[directive.status]}>{STATUS_LABEL[directive.status]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-zinc-200" title={directive.text}>
                    {directive.text}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {directive.id} · {timeAgo(directive.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
