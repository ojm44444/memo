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
  const playlist: PlaylistItem[] = []

  for (const song of songs) {
    const version = await getPrimaryVersionForSong(song.id)
    if (version?.localBlobId || version?.storagePath) {
      playlist.push({
        songId: song.id,
        audioVersionId: version.id,
        songTitle: song.title,
      })
    }
  }

  return playlist
}
