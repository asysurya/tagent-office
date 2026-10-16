/**
 * Path: apps/web/src/components/console/console-panel.tsx
 * Purpose: The office console — every manager decision, todo transition,
 *          agent thought, and tool call, streamed live from the daemon over
 *          socket.io into the virtualized log list.
 * Dependencies: ./log-list, ui/card, @/lib/store
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogList } from './log-list';
import { useOfficeStore } from '@/lib/store';

/** Realtime console card. */
export function ConsolePanel(): React.JSX.Element {
  const logs = useOfficeStore((state) => state.logs);

  return (
    <Card className="flex min-h-[320px] flex-1 flex-col overflow-hidden">
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Console</CardTitle>
          <CardDescription>Realtime office activity — streamed over socket.io</CardDescription>
        </div>
        <Badge variant="secondary" className="normal-case">
          {logs.length} lines
        </Badge>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 border-t border-zinc-800 p-0 pt-0">
        <div className="h-[calc(100%-1px)] max-h-[520px] min-h-[260px]">
          {logs.length === 0 ? (
            <p className="p-4 font-mono text-[11px] text-zinc-500">
              waiting for office activity… (send a directive)
            </p>
          ) : (
            <LogList logs={logs} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
