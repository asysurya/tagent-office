/**
 * Path: apps/web/src/components/todo/todo-list.tsx
 * Purpose: Live todo queue — priority bars, status badges, assignees, and a
 *          pending/active/done filter via tabs.
 * Dependencies: @tanstack/react-query, ui/badge, ui/card, ui/tabs, @/lib/api
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import type { Todo, TodoStatus } from '@tagent-office/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchTodos } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const STATUS_VARIANT: Record<TodoStatus, 'default' | 'secondary' | 'success' | 'warn' | 'danger' | 'info' | 'outline'> = {
  pending: 'secondary',
  assigned: 'info',
  in_progress: 'default',
  ready_for_test: 'info',
  testing: 'info',
  done: 'success',
  failed: 'danger',
  blocked: 'warn',
  paused: 'secondary',
  escalated: 'warn',
  cancelled: 'secondary',
};

const STATUS_LABEL: Record<TodoStatus, string> = {
  pending: 'pending',
  assigned: 'assigned',
  in_progress: 'working',
  ready_for_test: 'ready',
  testing: 'testing',
  done: 'done',
  failed: 'failed',
  blocked: 'blocked',
  paused: 'paused',
  escalated: 'escalated',
  cancelled: 'cancelled',
};

type Filter = 'all' | 'open' | 'done';

function isOpen(todo: Todo): boolean {
  return todo.status !== 'done' && todo.status !== 'cancelled' && todo.status !== 'failed';
}

/** Priority bar color by score. */
function priorityBar(priority: number): string {
  if (priority >= 90) return 'bg-red-500';
  if (priority >= 70) return 'bg-orange-500';
  if (priority >= 40) return 'bg-amber-500';
  return 'bg-zinc-500';
}

/** The todo queue. */
export function TodoList(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    refetchInterval: 5_000,
  });
  const todos = data ?? [];
  const visible = todos.filter((todo) =>
    filter === 'all' ? true : filter === 'open' ? isOpen(todo) : !isOpen(todo),
  );

  return (
    <Card className="min-h-0">
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Todos</CardTitle>
          <CardDescription>
            {todos.filter(isOpen).length} open · {todos.filter((todo) => !isOpen(todo)).length} finished
          </CardDescription>
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="done">Finished</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-zinc-500">No todos{filter === 'all' ? ' yet — send a directive' : ' in this view'}.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((todo) => (
              <li key={todo.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn('h-8 w-1 shrink-0 rounded-full', priorityBar(todo.priority))}
                    title={`priority ${todo.priority}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-200" title={todo.title}>
                      {todo.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className="font-mono">{todo.id}</span>
                      <span aria-hidden>·</span>
                      <span>{todo.type}</span>
                      <span aria-hidden>·</span>
                      <span>prio {todo.priority}</span>
                      {todo.assignee !== null ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="font-mono text-orange-400/80">{todo.assignee}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[todo.status]}>{STATUS_LABEL[todo.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
