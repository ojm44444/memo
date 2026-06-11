import { cn } from '@/lib/cn'
import { PLAYBACK_RATES, type PlaybackRate } from '@/lib/constants'

interface SpeedControlProps {
  value: PlaybackRate
  onChange: (rate: PlaybackRate) => void
  className?: string
}

export function SpeedControl({ value, onChange, className }: SpeedControlProps) {
  return (
    <div className={cn('flex gap-1 rounded-lg border border-border bg-bg-2 p-1', className)}>
      {PLAYBACK_RATES.map((rate) => (
        <button
          key={rate}
          type="button"
          onClick={() => onChange(rate)}
          className={cn(
            'rounded-md px-2 py-1 font-mono text-[0.65rem] transition-colors',
            value === rate
              ? 'bg-audio-mint text-bg'
              : 'text-muted hover:text-text',
          )}
        >
          {rate}x
        </button>
      ))}
    </div>
  )
}
