import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { decodeWaveformPeaks } from '@/lib/audio/decodeWaveformPeaks'

export interface WaveformMarker {
  id: string
  progress: number
  color?: string
  /** The note pinned here. Shown on hover: a dot that will not say what it
   * marks is a dot nobody clicks. */
  label?: string
}

export interface WaveformRegion {
  id: string
  startProgress: number
  endProgress: number
  color?: string
}

interface InteractiveWaveformProps {
  audioUrl: string | null
  cacheKey?: string
  progress: number
  active?: boolean
  height?: number
  className?: string
  markers?: WaveformMarker[]
  regions?: WaveformRegion[]
  onSeek: (progress: number) => void
  onMarkerClick?: (markerId: string) => void
}

export function InteractiveWaveform({
  audioUrl,
  cacheKey,
  progress,
  active = false,
  height = 40,
  className,
  markers = [],
  regions = [],
  onSeek,
  onMarkerClick,
}: InteractiveWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  // Use a ref for barCount so ResizeObserver doesn't trigger decode cancellation
  // on every pixel change — only commit a new decode when the bucket changes.
  const barCountRef = useRef(120)
  const [barBucket, setBarBucket] = useState(120)

  // Auto-size: 1 bar per ~2.5px, normalised to nearest 40 so minor resizes
  // don't cancel an in-flight decode.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w <= 0) return
      const raw = Math.max(40, Math.floor(w / 2.5))
      barCountRef.current = raw
      const bucket = Math.round(raw / 40) * 40 || raw
      setBarBucket((prev) => (prev === bucket ? prev : bucket))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!audioUrl) {
      setPeaks([])
      return
    }

    let cancelled = false
    setLoading(true)

    void decodeWaveformPeaks(audioUrl, barBucket, cacheKey)
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
  }, [audioUrl, barBucket, cacheKey])

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
            style={{ height: `${Math.max(8, peak * 100)}%` }}
          />
        ))
      )}
      {regions.map((region) => (
        <div
          key={region.id}
          className="interactive-waveform-region"
          style={{
            left: `${region.startProgress * 100}%`,
            width: `${(region.endProgress - region.startProgress) * 100}%`,
            background: region.color ?? 'rgba(239, 68, 68, 0.18)',
          }}
        />
      ))}
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className="interactive-waveform-marker"
          style={{
            left: `${marker.progress * 100}%`,
            ...(marker.color ? { backgroundColor: marker.color } : {}),
          }}
          onClick={(event) => {
            event.stopPropagation()
            onMarkerClick?.(marker.id)
            onSeek(marker.progress)
          }}
          title={marker.label ? `${marker.label}` : 'Jump to marker'}
        />
      ))}
    </div>
  )
}
