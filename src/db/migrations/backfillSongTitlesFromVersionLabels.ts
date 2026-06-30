import { db } from '@/db/database'
import { updateSong } from '@/db/repositories/boardRepo'

const MIGRATION_KEY = 'migration:backfillSongTitlesFromVersionLabels'

export async function backfillSongTitlesFromVersionLabels() {
  const already = await db.syncMeta.get(MIGRATION_KEY)
  if (already) return

  const songs = await db.songs.filter((s) => !s.deletedAt).toArray()

  for (const song of songs) {
    const versions = await db.audioVersions.where('songId').equals(song.id).toArray()
    if (versions.length !== 1) continue

    const label = versions[0].label.trim()
    if (!label || label.toLowerCase() === song.title.toLowerCase().trim()) continue

    await updateSong(song.id, { title: label })
  }

  await db.syncMeta.put({ key: MIGRATION_KEY, value: new Date().toISOString() })
}
