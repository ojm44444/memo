const peakCache = new Map<string, number[]>()

export async function decodeWaveformPeaks(
  url: string,
  barCount = 120,
  cacheKey?: string,
): Promise<number[]> {
  const cacheId = cacheKey ?? url
  const cached = peakCache.get(`${cacheId}:${barCount}`)
  if (cached) return cached

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
    peakCache.set(`${cacheId}:${barCount}`, normalized)
    return normalized
  } finally {
    void audioContext.close()
  }
}
