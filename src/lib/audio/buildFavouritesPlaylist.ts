import { getAllFavouriteSongs, getFavouriteSongs } from '@/db/repositories/boardRepo'
import { getPrimaryVersionForSong } from '@/db/repositories/audioRepo'
import { shuffleArray } from '@/lib/shuffle'
import type { PlaylistItem } from './buildColumnPlaylist'

export async function buildFavouritesPlaylist(
  scope: 'project' | 'library' = 'project',
  options?: { shuffle?: boolean },
): Promise<PlaylistItem[]> {
  const songs = scope === 'library' ? await getAllFavouriteSongs() : await getFavouriteSongs()
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

  return options?.shuffle ? shuffleArray(playlist) : playlist
}
