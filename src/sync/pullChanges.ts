import { dedupeColumnsBySlug } from '@/db/seed'
import { getActiveProjectId } from '@/db/repositories/projectRepo'
import { supabase } from '@/lib/supabase/client'
import { resolveBoardId } from '@/lib/supabase/boardAccess'
import { db } from '@/db/database'
import type { Column } from '@/types/column'
import type { Song } from '@/types/song'
import type { AudioVersion } from '@/types/audio-version'
import type { SongComment } from '@/types/song-comment'
import type { SongLink } from '@/types/song'
import type { ColumnSlug } from '@/types/column'

function maxTimestamp(current: string, candidate: string) {
  return candidate > current ? candidate : current
}

export async function pullChanges(userId: string) {
  if (!supabase) return { pulled: 0 }

  const boardId = await resolveBoardId(userId)
  if (!boardId) return { pulled: 0 }

  const { data: remoteBoard } = await supabase
    .from('boards')
    .select('name')
    .eq('id', boardId)
    .maybeSingle()

  if (remoteBoard?.name) {
    await db.syncMeta.put({ key: 'projectName', value: remoteBoard.name })
  }

  const lastPulledMeta = await db.syncMeta.get('lastPulledAt')
  let cursor = lastPulledMeta?.value ?? new Date(0).toISOString()

  const { data: remoteColumns, error: columnError } = await supabase
    .from('columns')
    .select('*')
    .eq('board_id', boardId)
    .order('position', { ascending: true })

  if (columnError) throw columnError

  let pulled = 0

  for (const remote of remoteColumns ?? []) {
    const local = await db.columns.where('slug').equals(remote.slug).first()

    // Keep local title if:
    // 1. There's an un-pushed rename in the outbox (push will reconcile), OR
    // 2. The local rename timestamp is newer than the remote record (covers the
    //    window after push clears the outbox but before Supabase propagates back).
    const hasPendingRename = local
      ? (await db.syncQueue
          .where('entityId').equals(local.id)
          .filter((item) => item.entityType === 'column' && item.op === 'update')
          .count()) > 0
      : false

    const remoteUpdatedAt = (remote as Record<string, unknown>).updated_at as string | undefined
    const localRenameIsNewer =
      local?.renamedAt && remoteUpdatedAt
        ? local.renamedAt > remoteUpdatedAt
        : false

    const keepLocalTitle = (hasPendingRename || localRenameIsNewer) && local

    const column: Column = {
      id: local?.id ?? remote.id,
      slug: remote.slug,
      title: keepLocalTitle ? local!.title : remote.title,
      sortOrder: remote.position,
      renamedAt: local?.renamedAt,
    }
    await db.columns.put(column)
    pulled++
  }

  await dedupeColumnsBySlug()

  const { data: remoteProjects, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .order('position', { ascending: true })

  if (projectError) throw projectError

  const remoteProjectIds = new Set((remoteProjects ?? []).map((p) => p.id))

  if (remoteProjects && remoteProjects.length > 0) {
    // If the server already has projects, remove any locally-created default project
    // that hasn't been pushed yet (still in outbox). This prevents duplicate "My Project"
    // entries when opening mem• on a new device that already has cloud data.
    const localUnpushed = await db.syncQueue
      .filter((item) => item.entityType === 'project' && item.op === 'create')
      .toArray()

    for (const entry of localUnpushed) {
      if (remoteProjectIds.has(entry.entityId)) continue
      const local = await db.projects.get(entry.entityId)
      if (!local) continue
      // Reassign any songs that landed under the phantom project to the first server project
      const firstRemoteId = remoteProjects[0].id
      await db.songs
        .filter((s) => s.projectId === local.id && !s.deletedAt)
        .modify({ projectId: firstRemoteId })
      await db.syncQueue.delete(entry.id)
      await db.projects.delete(entry.entityId)
    }
  }

  for (const remote of remoteProjects ?? []) {
    cursor = maxTimestamp(cursor, remote.updated_at)
    const local = await db.projects.get(remote.id)
    const remoteUpdated = new Date(remote.updated_at).getTime()
    const localCreated = local ? new Date(local.createdAt).getTime() : 0

    if (!local || remoteUpdated >= localCreated) {
      await db.projects.put({
        id: remote.id,
        name: remote.name,
        sortOrder: remote.position,
        createdAt: local?.createdAt ?? remote.created_at,
      })
      pulled++
    }
  }

  const { data: remoteSongs, error } = await supabase
    .from('songs')
    .select('*')
    .eq('board_id', boardId)

  if (error) throw error

  for (const remote of remoteSongs ?? []) {
    cursor = maxTimestamp(cursor, remote.updated_at)

    const local = await db.songs.get(remote.id)
    const remoteUpdated = new Date(remote.updated_at).getTime()
    const localUpdated = local ? new Date(local.updatedAt).getTime() : 0

    // Never overwrite a local edit that's queued but not yet pushed
    const pendingLocalEdit = await db.syncQueue
      .where('entityId').equals(remote.id)
      .filter((item) => item.entityType === 'song' && (item.op === 'update' || item.op === 'delete'))
      .first()
    if (pendingLocalEdit) continue

    if (local && localUpdated > remoteUpdated) continue

    if (!local || remoteUpdated >= localUpdated) {
      const remoteTags = Array.isArray((remote as { tags?: string[] }).tags)
        ? ((remote as { tags?: string[] }).tags ?? [])
        : (local?.tags ?? [])

      const remoteMeta = remote as {
        is_favourite?: boolean
        musical_key?: string | null
        bpm?: number | null
        project_id?: string | null
      }

      const song: Song = {
        id: remote.id,
        title: remote.title,
        columnSlug: remote.column_slug as ColumnSlug,
        projectId:
          remoteMeta.project_id ??
          local?.projectId ??
          (remoteProjects?.[0]?.id ?? (await getActiveProjectId())),
        tags: remoteTags,
        isFavourite: remoteMeta.is_favourite ?? local?.isFavourite ?? false,
        musicalKey: remoteMeta.musical_key ?? local?.musicalKey ?? null,
        bpm: remoteMeta.bpm ?? local?.bpm ?? null,
        recordedAt: local?.recordedAt ?? null,
        sortOrder: remote.position,
        notes: remote.notes ?? '',
        createdAt: local?.createdAt ?? remote.updated_at,
        updatedAt: remote.updated_at,
        syncedAt: new Date().toISOString(),
        deletedAt: remote.deleted_at,
      }
      await db.songs.put(song)
      pulled++
    }
  }

  const songIds = (await db.songs.toArray()).map((s) => s.id)
  if (songIds.length > 0) {
    const { data: remoteVersions, error: versionError } = await supabase
      .from('audio_versions')
      .select('*')
      .in('song_id', songIds)

    if (versionError) throw versionError

    for (const remote of remoteVersions ?? []) {
      cursor = maxTimestamp(cursor, remote.updated_at)

      const local = await db.audioVersions.get(remote.id)
      const remoteUpdated = new Date(remote.updated_at).getTime()
      const localUpdated = local?.syncedAt ? new Date(local.syncedAt).getTime() : 0

      const pendingVersionEdit = await db.syncQueue
        .where('entityId').equals(remote.id)
        .filter((item) => item.entityType === 'audio_version' && item.op === 'update')
        .first()
      if (pendingVersionEdit) continue

      if (!local || remoteUpdated >= localUpdated) {
        const version: AudioVersion = {
          id: remote.id,
          songId: remote.song_id,
          label: remote.label,
          durationMs: remote.duration_ms,
          mimeType: local?.mimeType ?? 'audio/mpeg',
          sortOrder: remote.position,
          localBlobId: local?.localBlobId ?? null,
          storagePath: remote.storage_path,
          recordedAt: local?.recordedAt ?? null,
          createdAt: local?.createdAt ?? remote.updated_at,
          syncedAt: new Date().toISOString(),
        }
        await db.audioVersions.put(version)
        pulled++
      }
    }

    const { data: remoteLinks, error: linkError } = await supabase
      .from('external_links')
      .select('*')
      .in('song_id', songIds)

    if (linkError) throw linkError

    for (const remote of remoteLinks ?? []) {
      const link: SongLink = {
        id: remote.id,
        songId: remote.song_id,
        url: remote.url,
        label: remote.label ?? '',
        createdAt: new Date().toISOString(),
      }
      await db.songLinks.put(link)
      pulled++
    }

    const { data: remoteComments, error: commentError } = await supabase
      .from('song_comments')
      .select('*')
      .eq('board_id', boardId)

    if (commentError) throw commentError

    for (const remote of remoteComments ?? []) {
      if (remote.deleted_at) {
        await db.songComments.delete(remote.id)
        pulled++
        continue
      }

      cursor = maxTimestamp(cursor, remote.updated_at)

      const local = await db.songComments.get(remote.id)
      const remoteUpdated = new Date(remote.updated_at).getTime()
      const localUpdated = local?.syncedAt ? new Date(local.syncedAt).getTime() : 0

      if (!local || !local.syncedAt || remoteUpdated >= localUpdated) {
        const comment: SongComment = {
          id: remote.id,
          songId: remote.song_id,
          userId: remote.user_id,
          authorLabel: remote.author_label,
          body: remote.body,
          createdAt: remote.created_at,
          updatedAt: remote.updated_at,
          syncedAt: new Date().toISOString(),
          deletedAt: remote.deleted_at,
        }
        await db.songComments.put(comment)
        pulled++
      }
    }
  }

  await db.syncMeta.put({ key: 'lastPulledAt', value: cursor })
  return { pulled }
}
