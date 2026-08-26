import { useMemo } from 'react'
import { cn } from '@/lib/cn'

interface WaveformProps {
  bars?: number
  peaks?: number[] | null
  progress?: number
  active?: boolean
  className?: string
  height?: number
}

export function Waveform({
  bars = 26,
  peaks = null,
  progress = 0,
  active = false,
  className,
  height,
}: WaveformProps) {
  const heights = useMemo(() => {
    if (peaks?.length) {
      return peaks.map((peak) => 18 + peak * 82)
    }

    return Array.from({ length: bars }, (_, index) => {
      const seed = Math.sin(index * 12.9898) * 43758.5453
      return 25 + (seed - Math.floor(seed)) * 75
    })
  }, [bars, peaks])

  const playedCount = Math.floor(bars * progress)

  return (
    <div className={cn('flex items-center gap-[1.5px]', !peaks && 'waveform-loading', className)} style={height ? { height } : { height: 24 }}>
      {heights.map((height, index) => (
        <div
          key={index}
          /**
           * Real classes, not Tailwind colour utilities.
           *
           * This used bg-audio-mint / bg-audio-mint-dim, and neither was ever
           * registered in the Tailwind theme, so the bars on a PLAYING card
           * rendered with no background at all. Tokens in CSS cannot silently
           * evaporate the way an unregistered utility class does.
           */
          className={cn(
            'wf-bar',
            index < playedCount && 'is-played',
            active && 'is-active',
          )}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
}
