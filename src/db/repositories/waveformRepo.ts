import { db } from '../database'

export async function getCachedPeaks(versionId: string, barCount: number): Promise<number[] | null> {
  try {
    const record = await db.waveformPeaks.get(`${versionId}:${barCount}`)
    return record?.peaks ?? null
  } catch {
    return null
  }
}

export async function setCachedPeaks(versionId: string, barCount: number, peaks: number[]): Promise<void> {
  try {
    await db.waveformPeaks.put({ key: `${versionId}:${barCount}`, peaks })
  } catch {
    // Non-critical — cache miss on next load is fine
  }
}
