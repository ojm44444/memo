export interface AudioFileMetadata {
  title?: string
  musicalKey: string | null
  bpm: number | null
  /** ISO string of when the audio was recorded. Derived from ID3 tag, then file.lastModified. */
  recordedAt: string | null
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

function recordedAtFromFile(file: File, tagDate?: string | null): string | null {
  // Prefer ID3 tag date if it looks like a full date
  if (tagDate && /^\d{4}-\d{2}-\d{2}/.test(tagDate)) {
    const d = new Date(tagDate)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // iPhone Voice Memos preserves the recording timestamp in file.lastModified
  if (file.lastModified) {
    const d = new Date(file.lastModified)
    // Sanity check: reject timestamps in the future or before 2000
    if (d.getFullYear() >= 2000 && d <= new Date()) return d.toISOString()
  }
  return null
}

export async function extractFileMetadata(file: File): Promise<AudioFileMetadata> {
  try {
    const { parseBlob } = await import('music-metadata')
    const { common } = await parseBlob(file, { skipCovers: true })
    return {
      title: common.title?.trim() || undefined,
      musicalKey: normalizeMusicalKey(common.key),
      bpm: normalizeBpm(common.bpm),
      recordedAt: recordedAtFromFile(file, common.date),
    }
  } catch {
    return { musicalKey: null, bpm: null, recordedAt: recordedAtFromFile(file) }
  }
}
