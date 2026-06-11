import { db } from '../database'
import { getActiveProjectId } from './projectRepo'

export type ActivityItem = {
  id: string
  type: 'song_updated' | 'comment'
  title: string
  subtitle: string
  timestamp: string
  songId: string
}

async function songInActiveProject(songId: string) {
  const song = await db.songs.get(songId)
  if (!song || song.deletedAt) return false
  const projectId = await getActiveProjectId()
  return song.projectId === projectId
}

export async function getBoardActivity(limit = 12): Promise<ActivityItem[]> {
  const projectId = await getActiveProjectId()
  const songs = await db.songs
    .filter((song) => !song.deletedAt && song.projectId === projectId)
    .toArray()

  const items: ActivityItem[] = songs
    .filter((song) => song.updatedAt !== song.createdAt)
    .map((song) => ({
      id: `song-${song.id}-${song.updatedAt}`,
      type: 'song_updated',
      title: song.title,
      subtitle: `Updated · ${song.columnSlug}`,
      timestamp: song.updatedAt,
      songId: song.id,
    }))

  const comments = await db.songComments.filter((comment) => !comment.deletedAt).toArray()
  for (const comment of comments) {
    if (!(await songInActiveProject(comment.songId))) continue
    const song = await db.songs.get(comment.songId)
    if (!song) continue

    items.push({
      id: `comment-${comment.id}`,
      type: 'comment',
      title: song.title,
      subtitle: `${comment.authorLabel || 'Bandmate'}: ${comment.body.trim().slice(0, 72)}${
        comment.body.length > 72 ? '…' : ''
      }`,
      timestamp: comment.createdAt,
      songId: comment.songId,
    })
  }

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit)
}
