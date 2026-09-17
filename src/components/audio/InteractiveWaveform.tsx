import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { decodeWaveformPeaks } from '@/lib/audio/decodeWaveformPeaks'
import { getCachedPeaks } from '@/db/repositories/waveformRepo'
import './InteractiveWaveform.css'

const FULL_BARS = 200
/** Smaller sets other views save (board cards, thumbnails), newest renderers first. */
const PREVIEW_BARS = [160, 120, 80, 40]

function stretch(source: number[], count: number) {
  if (!source.length) return source
  return Array.from({ length: count }, (_, i) => source[Math.min(source.length - 1, Math.floor((i / count) * source.length))])
}

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
  /* 17 Sept, Owen: the player waveform flashed and loaded late. Three causes:
     the bar count followed the width, so every resize threw away a decode
     and started another; nothing showed until the audio URL resolved, even
     when the peaks were already saved on this device; and switching songs
     kept the old song's shape until the new one decoded. Now: one fixed bar
     count, saved peaks (or the board card's smaller set, stretched) appear
     at once, and the peaks belong to a song, so a new song never shows the
     last one's shape. */
  const [state, setState] = useState<{ key: string; peaks: number[]; full: boolean }>({
    key: '',
    peaks: [],
    full: false,
  })
  const identity = cacheKey ?? audioUrl ?? ''
  const peaks = state.key === identity ? state.peaks : []
  const haveFull = state.key === identity && state.full

  // Instant: anything already saved for this version.
  useEffect(() => {
    if (!cacheKey) return
    let cancelled = false
    void (async () => {
      const full = await getCachedPeaks(cacheKey, FULL_BARS)
      if (cancelled) return
      if (full) {
        setState({ key: cacheKey, peaks: full, full: true })
        return
      }
      for (const count of PREVIEW_BARS) {
        const preview = await getCachedPeaks(cacheKey, count)
        if (cancelled) return
        if (preview) {
          setState((prev) =>
            prev.key === cacheKey && prev.full ? prev : { key: cacheKey, peaks: stretch(preview, FULL_BARS), full: false },
          )
          return
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cacheKey])

  // Detailed: decode once the audio is reachable, unless saved peaks already arrived.
  useEffect(() => {
    if (!audioUrl || haveFull) return
    let cancelled = false
    const key = identity
    void decodeWaveformPeaks(audioUrl, FULL_BARS, cacheKey)
      .then((decoded) => {
        if (!cancelled && decoded.length) setState({ key, peaks: decoded, full: true })
      })
      .catch(() => {
        /* keep whatever preview is showing */
      })
    return () => {
      cancelled = true
    }
  }, [audioUrl, cacheKey, identity, haveFull])

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
      {peaks.length === 0 ? (
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
