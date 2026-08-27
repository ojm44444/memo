import { cn } from '@/lib/cn'
import { PLAYBACK_RATES, type PlaybackRate } from '@/lib/constants'

interface SpeedControlProps {
  value: PlaybackRate
  onChange: (rate: PlaybackRate) => void
  className?: string
}


export function SpeedControl({ value, onChange, className }: SpeedControlProps) {

  return (
    <div className={cn('speed-control', className)}>
      {/* Preset buttons */}
      <div className="speed-presets">
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => onChange(rate)}
            className={cn(
              'speed-preset-btn',
              value === rate && 'is-active',
            )}
          >
            {rate}×
          </button>
        ))}
      </div>

      {/* P1-8: the slider is gone. The presets are the useful control, and two
          controls for one value invite the question of which one is real. The
          rate is still keyboard-reachable via the preset buttons. */}
    </div>
  )
}
