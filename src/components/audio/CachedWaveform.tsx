import { useEffect, useState } from 'react'
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
    let objectUrl: string | null = null
    let cancelled = false

    void (async () => {
      const url = await resolvePlaybackUrl(localBlobId, storagePath)
      if (!url || cancelled) return

      if (url.startsWith('blob:')) objectUrl = url

      try {
        const decoded = await decodeWaveformPeaks(url, bars, versionId)
        if (!cancelled) setPeaks(decoded)
      } catch {
        if (!cancelled) setPeaks(null)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
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
