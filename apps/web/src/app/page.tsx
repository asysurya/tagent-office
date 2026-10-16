/**
 * Path: apps/web/src/app/page.tsx
 * Purpose: The office — single-page dashboard (Phase 1 scope): directive
 *          inbox + input + todo queue on the left; agents + realtime
 *          console on the right.
 * Dependencies: components/*
 */
import { AgentCard } from '@/components/agent/agent-card';
import { ConsolePanel } from '@/components/console/console-panel';
import { DirectiveInbox } from '@/components/directive/directive-inbox';
import { DirectiveInput } from '@/components/directive/directive-input';
import { SplitView } from '@/components/layout/split-view';
import { TopNav } from '@/components/layout/top-nav';
import { TodoList } from '@/components/todo/todo-list';

export default function Page(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="flex-1">
        <SplitView
          left={
            <>
              <DirectiveInput />
              <DirectiveInbox />
              <TodoList />
            </>
          }
          right={
            <>
              <AgentCard />
              <ConsolePanel />
            </>
          }
        />
      </main>
      <footer className="mt-auto border-t border-zinc-800 py-3">
        <p className="mx-auto max-w-7xl px-4 text-[11px] text-zinc-600 lg:px-6">
          Tagent Office · Phase 1 Foundation · self-hosted, your keys never leave this machine
        </p>
      </footer>
    </div>
  );
}
