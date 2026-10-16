/**
 * Path: apps/web/src/components/ui/badge.tsx
 * Purpose: Badge primitive (shadcn-style, vendored).
 * Dependencies: class-variance-authority, @/lib/utils
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
        secondary: 'border-zinc-700 bg-zinc-800 text-zinc-300',
        outline: 'border-zinc-700 bg-transparent text-zinc-300',
        success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
        warn: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
        danger: 'border-red-500/40 bg-red-500/10 text-red-400',
        info: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** Small status pill. */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
