import { createId } from '@/lib/ids'
import { getBoardUserId, resolveBoardAuth } from '@/lib/auth/session'
import type { SongComment } from '@/types/song-comment'
import { db } from '../database'
import { enqueueSync } from './outboxRepo'

export async function getCommentsForSong(songId: string) {
  const comments = await db.songComments.where('songId').equals(songId).sortBy('createdAt')
  return comments.filter((c) => !c.deletedAt)
}

export async function addSongComment(songId: string, body: string) {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Comment cannot be empty')

  const auth = await resolveBoardAuth()
  if (!auth) throw new Error('Sign in required')

  const authorLabel = auth.user.email?.split('@')[0] ?? 'You'
  const now = new Date().toISOString()

  const comment: SongComment = {
    id: createId(),
    songId,
    userId: auth.user.id,
    authorLabel,
    body: trimmed,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
  }

  await db.songComments.add(comment)
  await enqueueSync('create', 'song_comment', comment.id, comment)
  return comment
}

export async function deleteSongComment(commentId: string) {
  const comment = await db.songComments.get(commentId)
  if (!comment || comment.deletedAt) return

  const userId = await getBoardUserId()
  if (!userId || userId !== comment.userId) throw new Error('You can only delete your own comments')

  const deleted: SongComment = {
    ...comment,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.songComments.put(deleted)
  await enqueueSync('delete', 'song_comment', commentId, { id: commentId })
}
