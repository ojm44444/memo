import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { decodeWaveformPeaks } from '@/lib/audio/decodeWaveformPeaks'

export interface WaveformMarker {
  id: string
  progress: number
}

interface InteractiveWaveformProps {
  audioUrl: string | null
  progress: number
  active?: boolean
  barCount?: number
  height?: number
  className?: string
  markers?: WaveformMarker[]
  onSeek: (progress: number) => void
  onMarkerClick?: (markerId: string) => void
}

export function InteractiveWaveform({
  audioUrl,
  progress,
  active = false,
  barCount = 120,
  height = 40,
  className,
  markers = [],
  onSeek,
  onMarkerClick,
}: InteractiveWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!audioUrl) {
      setPeaks([])
      return
    }

    let cancelled = false
    setLoading(true)

    void decodeWaveformPeaks(audioUrl, barCount)
      .then((decoded) => {
        if (!cancelled) setPeaks(decoded)
      })
      .catch(() => {
        if (!cancelled) setPeaks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [audioUrl, barCount])

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onSeek(fraction)
    },
    [onSeek],
  )

  const onPointerDown = (event: React.PointerEvent) => {
    event.preventDefault()
    const el = containerRef.current
    if (el) {
      try {
        el.setPointerCapture(event.pointerId)
      } catch {
        // Some mobile browsers throw if the pointer is already released
      }
    }
    seekFromClientX(event.clientX)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!event.buttons) return
    seekFromClientX(event.clientX)
  }

  const playedCount = Math.floor(peaks.length * progress)

  return (
    <div
      ref={containerRef}
      className={cn('interactive-waveform', active && 'is-active', className)}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      role="slider"
      aria-label="Seek audio"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.05))
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.05))
      }}
    >
      {loading && peaks.length === 0 ? (
        <div className="interactive-waveform-skeleton" />
      ) : (
        peaks.map((peak, index) => (
          <div
            key={index}
            className={cn(
              'interactive-waveform-bar',
              index < playedCount ? 'is-played' : undefined,
            )}
            style={{ height: `${Math.max(12, peak * 100)}%` }}
          />
        ))
      )}
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className="interactive-waveform-marker"
          style={{ left: `${marker.progress * 100}%` }}
          onClick={(event) => {
            event.stopPropagation()
            onMarkerClick?.(marker.id)
            onSeek(marker.progress)
          }}
          title="Jump to comment"
        />
      ))}
    </div>
  )
}
