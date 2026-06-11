import { cn } from '@/lib/cn'
import { PLAYBACK_RATES, type PlaybackRate } from '@/lib/constants'

interface SpeedControlProps {
  value: PlaybackRate
  onChange: (rate: PlaybackRate) => void
}

export function SpeedControl({ value, onChange }: SpeedControlProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-bg-2 p-1">
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
