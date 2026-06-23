import { getSongsByColumn } from '@/db/repositories/boardRepo'
import { getPrimaryVersionForSong } from '@/db/repositories/audioRepo'
import type { ColumnSlug } from '@/types/column'

export interface PlaylistItem {
  songId: string
  audioVersionId: string
  songTitle: string
}

export async function buildColumnPlaylist(columnSlug: ColumnSlug): Promise<PlaylistItem[]> {
  const songs = await getSongsByColumn(columnSlug)

  const results = await Promise.all(
    songs.map(async (song) => {
      const version = await getPrimaryVersionForSong(song.id)
      if (!version?.localBlobId && !version?.storagePath) return null
      return { songId: song.id, audioVersionId: version.id, songTitle: song.title }
    }),
  )

  return results.filter((item): item is PlaylistItem => item !== null)
}
