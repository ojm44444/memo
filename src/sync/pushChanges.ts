import { getSyncQueue, markSyncFailed, removeSyncItem, MAX_SYNC_ATTEMPTS } from '@/db/repositories/outboxRepo'
import { errorMessage } from '@/lib/errorMessage'
import { supabase } from '@/lib/supabase/client'
import { getBoardRole, resolveBoardId } from '@/lib/supabase/boardAccess'
import type { Database } from '@/lib/supabase/database.types'
import { db } from '@/db/database'
import { uploadAudioVersion, ensureBoardForUser } from './audioUpload'
import type { SyncQueueItem } from '@/types/sync'

type SongUpdate = Database['public']['Tables']['songs']['Update']

type PushResult = { pushed: number; failed: number; lastFailure: string | null }

async function assertNoError<T>(result: { error: T | null }) {
  if (result.error) throw result.error
}

async function processQueueItem(
  item: SyncQueueItem,
  userId: string,
  boardId: string,
) {
  const payload = JSON.parse(item.payload)

  if (item.entityType === 'song') {
    if (item.op === 'create') {
      await assertNoError(
        await supabase!.from('songs').upsert({
          id: payload.id,
          board_id: boardId,
          column_slug: payload.columnSlug,
          title: payload.title,
          notes: payload.notes ?? '',
          tags: payload.tags ?? [],
          is_favourite: payload.isFavourite ?? false,
          musical_key: payload.musicalKey ?? null,
          bpm: payload.bpm ?? null,
          position: payload.sortOrder,
          updated_at: payload.updatedAt,
          deleted_at: payload.deletedAt,
          project_id: payload.projectId ?? null,
        }),
      )
      await db.songs.update(item.entityId, { syncedAt: new Date().toISOString() })
    } else if (item.op === 'update') {
      const patch: SongUpdate = {
        updated_at: payload.updatedAt ?? new Date().toISOString(),
      }
      if (payload.columnSlug !== undefined) patch.column_slug = payload.columnSlug
      if (payload.sortOrder !== undefined) patch.position = payload.sortOrder
      if (payload.title !== undefined) patch.title = payload.title
      if (payload.notes !== undefined) patch.notes = payload.notes
      if (payload.tags !== undefined) (patch as { tags?: string[] }).tags = payload.tags
      if (payload.isFavourite !== undefined) {
        ;(patch as { is_favourite?: boolean }).is_favourite = payload.isFavourite
      }
      if (payload.musicalKey !== undefined) {
        ;(patch as { musical_key?: string | null }).musical_key = payload.musicalKey
      }
      if (payload.bpm !== undefined) {
        ;(patch as { bpm?: number | null }).bpm = payload.bpm
      }
      if (payload.projectId !== undefined) {
        ;(patch as { project_id?: string | null }).project_id = payload.projectId
      }

      await assertNoError(
        await supabase!.from('songs').update(patch).eq('id', item.entityId),
      )
      await db.songs.update(item.entityId, { syncedAt: new Date().toISOString() })
    } else if (item.op === 'delete') {
      await assertNoError(
        await supabase!
          .from('songs')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', item.entityId),
      )
    }
  }

  if (item.entityType === 'audio_version') {
    if (item.op === 'upload') {
      const { data: remoteSong } = await supabase!
        .from('songs')
        .select('id')
        .eq('id', payload.songId)
        .maybeSingle()

      if (!remoteSong) {
        throw new Error('Song info has not reached the cloud yet — retrying')
      }

      await uploadAudioVersion(item.entityId, userId, boardId, payload)
    } else if (item.op === 'update') {
      await assertNoError(
        await supabase!
          .from('audio_versions')
          .update({
            label: payload.label,
            position: payload.sortOrder,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.entityId),
      )
    } else if (item.op === 'delete') {
      await assertNoError(
        await supabase!.from('audio_versions').delete().eq('id', item.entityId),
      )
    }
  }

  if (item.entityType === 'song_comment') {
    if (item.op === 'create') {
      await assertNoError(
        await supabase!.from('song_comments').upsert({
          id: payload.id,
          song_id: payload.songId,
          board_id: boardId,
          user_id: payload.userId,
          author_label: payload.authorLabel ?? '',
          body: payload.body,
          created_at: payload.createdAt,
          updated_at: payload.updatedAt,
          deleted_at: payload.deletedAt,
        }),
      )
      await db.songComments.update(item.entityId, { syncedAt: new Date().toISOString() })
    } else if (item.op === 'delete') {
      await assertNoError(
        await supabase!
          .from('song_comments')
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', item.entityId),
      )
    }
  }

  if (item.entityType === 'song_link') {
    if (item.op === 'create') {
      await assertNoError(
        await supabase!.from('external_links').upsert({
          id: payload.id,
          song_id: payload.songId,
          url: payload.url,
          label: payload.label ?? '',
        }),
      )
    } else if (item.op === 'delete') {
      await assertNoError(
        await supabase!.from('external_links').delete().eq('id', item.entityId),
      )
    }
  }

  if (item.entityType === 'board' && item.op === 'update') {
    await assertNoError(
      await supabase!.from('boards').update({ name: payload.name }).eq('id', boardId),
    )
  }

  if (item.entityType === 'project') {
    if (item.op === 'create') {
      await assertNoError(
        await supabase!.from('projects').upsert({
          id: payload.id,
          board_id: boardId,
          name: payload.name,
          position: payload.sortOrder ?? 0,
          updated_at: payload.createdAt ?? new Date().toISOString(),
        }),
      )
    } else if (item.op === 'update') {
      const update: { name?: string; position?: number; updated_at: string } = {
        updated_at: payload.updatedAt ?? new Date().toISOString(),
      }
      if (payload.name !== undefined) update.name = payload.name
      if (payload.sortOrder !== undefined) update.position = payload.sortOrder

      await assertNoError(
        await supabase!.from('projects').update(update).eq('id', item.entityId),
      )
    } else if (item.op === 'delete') {
      await assertNoError(
        await supabase!
          .from('projects')
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', item.entityId),
      )
    }
  }

  if (item.entityType === 'column') {
    if (item.op === 'create') {
      await assertNoError(
        await supabase!.from('columns').upsert(
          {
            id: payload.id,
            board_id: boardId,
            slug: payload.slug,
            title: payload.title,
            position: payload.sortOrder,
          },
          { onConflict: 'board_id,slug' },
        ),
      )
    } else if (item.op === 'update') {
      // Match by slug (stable) not id — local and server ids can diverge if
      // the initial create was pushed via upsert on a different device.
      await assertNoError(
        await supabase!
          .from('columns')
          .update({ title: payload.title, position: payload.sortOrder })
          .eq('board_id', boardId)
          .eq('slug', payload.slug),
      )
    } else if (item.op === 'delete') {
      await assertNoError(
        await supabase!
          .from('columns')
          .delete()
          .eq('board_id', boardId)
          .eq('slug', payload.slug),
      )
    }
  }
}

async function bootstrapProjects(boardId: string) {
  const projects = await db.projects.orderBy('sortOrder').toArray()
  if (!projects.length || !supabase) return

  await assertNoError(
    await supabase.from('projects').upsert(
      projects.map((project) => ({
        id: project.id,
        board_id: boardId,
        name: project.name,
        position: project.sortOrder,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'id' },
    ),
  )
}

export async function pushChanges(userId: string): Promise<PushResult> {
  const queue = await getSyncQueue()

  if (!supabase) {
    return {
      pushed: 0,
      failed: queue.length,
      lastFailure: queue.length ? 'Cloud sync is not configured on this device' : null,
    }
  }

  // Skip session refresh when offline — resolveBoardAuth() already validated.
  if (navigator.onLine) {
    await supabase.auth.getSession()
  }

  let boardId: string | null = null

  try {
    boardId = await resolveBoardId(userId)
    if (!boardId) boardId = await ensureBoardForUser(userId)
  } catch (err) {
    return {
      pushed: 0,
      failed: queue.length,
      lastFailure: queue.length ? `Board error: ${errorMessage(err)}` : null,
    }
  }

  if (!boardId) {
    return {
      pushed: 0,
      failed: queue.length,
      lastFailure: queue.length
        ? 'No board in the cloud — sign out, sign in again, then tap sync'
        : null,
    }
  }

  const role = await getBoardRole(userId, boardId)
  const canWrite = role === 'owner'

  if (canWrite) {
    try {
      await bootstrapProjects(boardId)
    } catch (err) {
      return {
        pushed: 0,
        failed: queue.length,
        lastFailure: `Project sync error: ${errorMessage(err)}`,
      }
    }
  }
  const canComment = role === 'owner' || role === 'editor' || role === 'viewer'

  let pushed = 0
  let failed = 0
  let lastFailure: string | null = null

  const metadataItems = queue.filter((item) => item.entityType !== 'audio_version')
  const audioItems = queue.filter((item) => item.entityType === 'audio_version')

  for (const item of [...metadataItems, ...audioItems]) {
    if (item.attempts >= MAX_SYNC_ATTEMPTS) {
      // Permanently failed — remove from queue so it doesn't block the badge
      // or subsequent items indefinitely. The local data is untouched.
      await removeSyncItem(item.id)
      failed++
      lastFailure = item.lastError ?? 'Max retries exceeded'
      continue
    }

    try {
      if (item.entityType === 'song_comment') {
        if (!canComment) throw new Error('You do not have permission to comment on this board')
      } else if (!canWrite) {
        throw new Error('You do not have permission to upload to this board')
      }

      await processQueueItem(item, userId, boardId)
      await removeSyncItem(item.id)
      pushed++
    } catch (err) {
      failed++
      const msg = errorMessage(err)
      lastFailure = msg
      await markSyncFailed(item.id, msg)
    }
  }

  return { pushed, failed, lastFailure }
}
