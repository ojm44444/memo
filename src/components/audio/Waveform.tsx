import { useMemo } from 'react'
import { cn } from '@/lib/cn'

interface WaveformProps {
  bars?: number
  peaks?: number[] | null
  progress?: number
  active?: boolean
  className?: string
}

export function Waveform({
  bars = 26,
  peaks = null,
  progress = 0,
  active = false,
  className,
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
    <div className={cn('flex h-6 items-center gap-[1.5px]', className)}>
      {heights.map((height, index) => (
        <div
          key={index}
          className={cn(
            'flex-1 rounded-[1px]',
            index < playedCount
              ? active
                ? 'bg-audio-mint'
                : 'waveform-bar-played'
              : active
                ? 'bg-audio-mint-dim'
                : 'waveform-bar-idle',
          )}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
}
