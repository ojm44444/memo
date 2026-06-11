import { cn } from '@/lib/cn'
import type { HTMLAttributes } from 'react'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-bg-3 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted',
        className,
      )}
      {...props}
    />
  )
}
