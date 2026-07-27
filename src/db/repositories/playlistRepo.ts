import { db, type PlaylistRecord, type PlaylistSongRecord } from '@/db/database'
import { createId } from '@/lib/ids'

export async function getPlaylists(): Promise<PlaylistRecord[]> {
  return db.playlists.orderBy('sortOrder').toArray()
}

export async function getPlaylist(id: string): Promise<PlaylistRecord | undefined> {
  return db.playlists.get(id)
}

export async function createPlaylist(name: string): Promise<PlaylistRecord> {
  const count = await db.playlists.count()
  const playlist: PlaylistRecord = {
    id: createId(),
    name: name.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sortOrder: count,
  }
  await db.playlists.add(playlist)
  return playlist
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  await db.playlists.update(id, { name: name.trim(), updatedAt: Date.now() })
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.transaction('rw', [db.playlists, db.playlistSongs], async () => {
    await db.playlistSongs.where('playlistId').equals(id).delete()
    await db.playlists.delete(id)
  })
}

export async function getPlaylistSongs(playlistId: string): Promise<PlaylistSongRecord[]> {
  return db.playlistSongs.where('playlistId').equals(playlistId).sortBy('position')
}

export async function addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
  // Don't add duplicates
  const existing = await db.playlistSongs
    .where('playlistId').equals(playlistId)
    .and(r => r.songId === songId)
    .first()
  if (existing) return

  const current = await db.playlistSongs.where('playlistId').equals(playlistId).count()
  await db.playlistSongs.add({
    id: createId(),
    playlistId,
    songId,
    position: current,
    addedAt: Date.now(),
  })
  await db.playlists.update(playlistId, { updatedAt: Date.now() })
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  await db.playlistSongs
    .where('playlistId').equals(playlistId)
    .and(r => r.songId === songId)
    .delete()
  await db.playlists.update(playlistId, { updatedAt: Date.now() })
}

export async function isSongInPlaylist(playlistId: string, songId: string): Promise<boolean> {
  const row = await db.playlistSongs
    .where('playlistId').equals(playlistId)
    .and(r => r.songId === songId)
    .first()
  return !!row
}

export async function getSongPlaylistIds(songId: string): Promise<string[]> {
  const rows = await db.playlistSongs.where('songId').equals(songId).toArray()
  return rows.map(r => r.playlistId)
}

export async function reorderPlaylistSong(
  playlistId: string,
  songId: string,
  newPosition: number,
): Promise<void> {
  const songs = await db.playlistSongs.where('playlistId').equals(playlistId).sortBy('position')
  const idx = songs.findIndex(s => s.songId === songId)
  if (idx === -1) return
  songs.splice(newPosition, 0, songs.splice(idx, 1)[0])
  await db.transaction('rw', db.playlistSongs, async () => {
    for (let i = 0; i < songs.length; i++) {
      await db.playlistSongs.update(songs[i].id, { position: i })
    }
  })
}
