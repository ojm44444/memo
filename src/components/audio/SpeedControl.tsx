import { cn } from '@/lib/cn'
import { PLAYBACK_RATES, type PlaybackRate } from '@/lib/constants'

interface SpeedControlProps {
  value: PlaybackRate
  onChange: (rate: PlaybackRate) => void
  className?: string
}

const SLIDER_MIN = 0.75
const SLIDER_MAX = 2
const SLIDER_STEP = 0.05

export function SpeedControl({ value, onChange, className }: SpeedControlProps) {
  const pct = ((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100

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

      {/* Slider */}
      <div className="speed-slider-wrap">
        <input
          type="range"
          className="speed-slider"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Playback speed"
          style={{ '--speed-pct': `${pct}%` } as React.CSSProperties}
        />
        <span className="speed-readout">{value.toFixed(2).replace(/\.?0+$/, '')}×</span>
      </div>
    </div>
  )
}
