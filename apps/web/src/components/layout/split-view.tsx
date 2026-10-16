/**
 * Path: apps/web/src/components/layout/split-view.tsx
 * Purpose: Two-pane responsive layout (PRD 2.8: 4px rhythm, generous
 *          whitespace). Desktop: fixed left rail + fluid right stage.
 *          Mobile: single column, console last.
 * Dependencies: @/lib/utils
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Split view props. */
interface SplitViewProps {
  left: ReactNode;
  right: ReactNode;
}

/** Two-pane application shell. */
export function SplitView({ left, right }: SplitViewProps): React.JSX.Element {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(360px,420px)_1fr] lg:px-6 lg:py-6">
      <div className={cn('flex min-w-0 flex-col gap-4')}>{left}</div>
      <div className={cn('flex min-w-0 flex-col gap-4')}>{right}</div>
    </div>
  );
}
