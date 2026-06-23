import { useEffect, useState } from 'react'
import { getCachedPeaks } from '@/db/repositories/waveformRepo'
import { decodeWaveformPeaks } from '@/lib/audio/decodeWaveformPeaks'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { Waveform } from './Waveform'

interface CachedWaveformProps {
  versionId: string
  localBlobId: string | null
  storagePath: string | null
  bars?: number
  progress?: number
  active?: boolean
  className?: string
}

export function CachedWaveform({
  versionId,
  localBlobId,
  storagePath,
  bars = 26,
  progress = 0,
  active = false,
  className,
}: CachedWaveformProps) {
  const [peaks, setPeaks] = useState<number[] | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      // Fast path: IDB cache hit — no blob load or AudioContext needed
      const cached = await getCachedPeaks(versionId, bars)
      if (cached) {
        if (!cancelled) setPeaks(cached)
        return
      }

      // resolvePlaybackUrl caches local object URLs — do NOT revoke them here
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

  return (
    <Waveform
      bars={bars}
      peaks={peaks}
      progress={progress}
      active={active}
      className={className}
    />
  )
}
