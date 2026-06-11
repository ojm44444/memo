export interface AudioFileMetadata {
  title?: string
  musicalKey: string | null
  bpm: number | null
}

export function normalizeMusicalKey(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed
}

export function normalizeBpm(raw: number | undefined | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null
  const rounded = Math.round(raw)
  return rounded > 0 && rounded < 400 ? rounded : null
}

export async function extractFileMetadata(file: File): Promise<AudioFileMetadata> {
  try {
    const { parseBlob } = await import('music-metadata')
    const { common } = await parseBlob(file, { skipCovers: true })
    return {
      title: common.title?.trim() || undefined,
      musicalKey: normalizeMusicalKey(common.key),
      bpm: normalizeBpm(common.bpm),
    }
  } catch {
    return { musicalKey: null, bpm: null }
  }
}
