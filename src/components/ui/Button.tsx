import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'mint'
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
        variant === 'primary' && 'bg-accent text-bg hover:bg-accent-hover',
        variant === 'mint' && 'bg-audio-mint text-bg hover:brightness-110',
        variant === 'ghost' && 'border border-border text-muted hover:border-text/20 hover:text-text',
        className,
      )}
      {...props}
    />
  )
}
