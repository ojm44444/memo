import { getCachedPeaks, setCachedPeaks } from '@/db/repositories/waveformRepo'

const memPeakCache = new Map<string, number[]>()

// Browsers cap simultaneous AudioContexts at ~6. Keep well under that.
const MAX_CONCURRENT_DECODES = 3
let activeDecodes = 0
const decodeQueue: Array<() => void> = []

function acquireDecode(): Promise<() => void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (activeDecodes < MAX_CONCURRENT_DECODES) {
        activeDecodes++
        resolve(() => {
          activeDecodes--
          const next = decodeQueue.shift()
          if (next) next()
        })
      } else {
        decodeQueue.push(tryAcquire)
      }
    }
    tryAcquire()
  })
}

export async function decodeWaveformPeaks(
  url: string,
  barCount = 120,
  cacheKey?: string,
): Promise<number[]> {
  const cacheId = cacheKey ?? url
  const memKey = `${cacheId}:${barCount}`

  // 1. Memory cache (fastest)
  const memCached = memPeakCache.get(memKey)
  if (memCached) return memCached

  // 2. IDB cache — only when we have a stable key (versionId), avoids blob load entirely
  if (cacheKey) {
    const idbCached = await getCachedPeaks(cacheKey, barCount)
    if (idbCached) {
      memPeakCache.set(memKey, idbCached)
      return idbCached
    }
  }

  // 3. Full decode — throttled to prevent AudioContext pool exhaustion
  const release = await acquireDecode()
  try {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    const audioContext = new AudioContext()
    try {
      const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0))
      const channel = audioBuffer.getChannelData(0)
      const samplesPerBar = Math.max(1, Math.floor(channel.length / barCount))
      const peaks: number[] = []

      for (let i = 0; i < barCount; i++) {
        const start = i * samplesPerBar
        const end = Math.min(start + samplesPerBar, channel.length)
        let peak = 0
        for (let j = start; j < end; j++) {
          const value = Math.abs(channel[j])
          if (value > peak) peak = value
        }
        peaks.push(peak)
      }

      const max = Math.max(...peaks, 0.001)
      const normalized = peaks.map((p) => p / max)

      memPeakCache.set(memKey, normalized)
      if (cacheKey) void setCachedPeaks(cacheKey, barCount, normalized)

      return normalized
    } finally {
      void audioContext.close()
    }
  } finally {
    release()
  }
}
