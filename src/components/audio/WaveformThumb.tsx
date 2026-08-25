import { useEffect, useState } from 'react'
import { getCachedPeaks } from '@/db/repositories/waveformRepo'
import { decodeWaveformPeaks } from '@/lib/audio/decodeWaveformPeaks'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { stageColorVar } from '@/lib/stageColor'
import { cn } from '@/lib/cn'

interface WaveformThumbProps {
  versionId: string | null
  localBlobId: string | null
  storagePath: string | null
  columnSlug: string | null | undefined
  size?: number
  bars?: number
  className?: string
}

/**
 * A song's identity is its own waveform, in its stage colour.
 *
 * Replaces the seeded per-song gradient covers. A grid of generated gradient
 * tiles is Samply's library and reads as theirs, and it told you nothing about
 * the song. The waveform is the one image that is genuinely this song's.
 *
 * One renderer, used at card, player-bar and share sizes.
 */
export function WaveformThumb({
  versionId,
  localBlobId,
  storagePath,
  columnSlug,
  size = 44,
  bars = 14,
  className,
}: WaveformThumbProps) {
  const [peaks, setPeaks] = useState<number[] | null>(null)

  useEffect(() => {
    if (!versionId) return
    let cancelled = false

    void (async () => {
      const cached = await getCachedPeaks(versionId, bars)
      if (cached) {
        if (!cancelled) setPeaks(cached)
        return
      }
      const url = await resolvePlaybackUrl(localBlobId, storagePath)
      if (!url || cancelled) return
      try {
        const decoded = await decodeWaveformPeaks(url, bars, versionId)
        if (!cancelled) setPeaks(decoded)
      } catch {
        if (!cancelled) setPeaks(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [versionId, localBlobId, storagePath, bars])

  const ink = stageColorVar(columnSlug)

  // Before peaks decode, show a flat mid-height bed rather than an empty box,
  // so the thumbnail never pops in from nothing.
  const heights =
    peaks?.length
      ? peaks.map((p) => Math.max(12, p * 100))
      : Array.from({ length: bars }, () => 26)

  return (
    <div
      className={cn('waveform-thumb', className)}
      style={{ width: size, height: size, ['--thumb-ink' as string]: ink }}
      aria-hidden
    >
      {heights.map((h, i) => (
        <span key={i} className="waveform-thumb-bar" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}
