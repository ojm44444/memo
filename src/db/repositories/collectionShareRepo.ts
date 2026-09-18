import { supabase } from '@/lib/supabase/client'
import { resolveBoardId } from '@/lib/supabase/boardAccess'
import { getBoardUserId } from '@/lib/auth/session'
import type { ShareLifetimeDays } from '@/db/repositories/shareRepo'
import { createId } from '@/lib/ids'
import { fetchShareAudio } from '@/lib/share/shareAudio'

/**
 * Collections: one link to a set of mixes (036).
 *
 * Built on the playlist share tables, so every older playlist link opens on
 * the same page. Each track pins an exact take, so the label hears the mix you
 * picked, not whatever happens to be first on the card.
 */

export interface CollectionItem {
  songId: string
  versionId: string
}

export interface CollectionTrack {
  position: number
  song_id: string
  version_id: string
  title: string
  version_label: string | null
  kind: 'take' | 'demo' | 'mix' | 'master' | null
  duration_ms: number
  storage_path: string
}

export interface CollectionComment {
  id: string
  version_id: string
  timestamp_ms: number
  body: string
  author_name: string
  created_at: string
}

export interface CollectionPayload {
  title: string | null
  artist: string | null
  allow_download: boolean
  expires_at: string | null
  cover_path: string | null
  tracks: CollectionTrack[]
  /** Tracks in the link still uploading; they appear once they land. */
  pending_count?: number
  comments: CollectionComment[]
}

export interface CollectionLinkRow {
  id: string
  token: string
  title: string | null
  artist: string | null
  created_at: string
  expires_at: string | null
  allow_download: boolean
  password_required: boolean
  view_count: number
  listen_count: number
  last_viewed_at: string | null
  track_count: number
  comment_count: number
}

// The generated types do not know these RPCs; keep the escape hatch in one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args)

export function collectionUrl(token: string) {
  return `${window.location.origin}/playlist/${token}`
}

export async function createCollectionShare(
  items: CollectionItem[],
  options: {
    title?: string
    artist?: string
    allowDownload?: boolean
    expiresInDays?: ShareLifetimeDays
    password?: string
    coverPath?: string | null
  } = {},
): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const userId = await getBoardUserId()
  if (!userId) throw new Error('Sign in to share')
  const boardId = await resolveBoardId(userId)
  if (!boardId) throw new Error('Board not found')

  /* Share before the upload finishes (17 Sept): make sure every chosen take
     at least exists in the cloud, so the link can hold it and fill in when
     its audio arrives. */
  await ensureVersionRows(items.map((i) => i.versionId))

  const { data, error } = await rpc('create_collection_share', {
    p_board_id: boardId,
    p_items: items.map((item) => ({ song_id: item.songId, version_id: item.versionId })),
    p_title: options.title?.trim() || null,
    p_artist: options.artist?.trim() || null,
    p_allow_download: options.allowDownload ?? false,
    p_expires_in_days: options.expiresInDays ?? 90,
    p_password: options.password?.trim() || null,
    p_cover_path: options.coverPath ?? null,
  })
  if (error) throw new Error(error.message)
  return collectionUrl(data as string)
}

/** Your live collection links, newest first, with what has happened on them. */
export async function listCollectionLinks(): Promise<CollectionLinkRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('playlist_shares')
    .select(
      'id, token, title, label, artist, created_at, expires_at, allow_download, password_hash, view_count, listen_count, last_viewed_at, playlist_share_songs(count), playlist_share_comments(count)',
    )
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error

  type Raw = {
    id: string
    token: string
    title: string | null
    label: string | null
    artist: string | null
    created_at: string
    expires_at: string | null
    allow_download: boolean
    password_hash: string | null
    view_count: number | null
    listen_count: number | null
    last_viewed_at: string | null
    playlist_share_songs: { count: number }[]
    playlist_share_comments: { count: number }[]
  }

  return ((data ?? []) as unknown as Raw[])
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
    .map((row) => ({
      id: row.id,
      token: row.token,
      title: row.title ?? row.label,
      artist: row.artist,
      created_at: row.created_at,
      expires_at: row.expires_at,
      allow_download: row.allow_download,
      password_required: row.password_hash != null,
      view_count: row.view_count ?? 0,
      listen_count: row.listen_count ?? 0,
      last_viewed_at: row.last_viewed_at,
      track_count: row.playlist_share_songs?.[0]?.count ?? 0,
      comment_count: row.playlist_share_comments?.[0]?.count ?? 0,
    }))
}

export async function listCollectionComments(shareId: string): Promise<CollectionComment[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('playlist_share_comments' as never)
    .select('id, version_id, timestamp_ms, body, author_name, created_at')
    .eq('playlist_share_id', shareId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as CollectionComment[]
}

export async function revokeCollectionLink(token: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await rpc('revoke_playlist_share', { p_token: token })
  if (error) throw new Error(error.message)
}

async function ensureVersionRows(versionIds: string[]) {
  if (!supabase) return
  const { db } = await import('@/db/database')
  const pending = (await db.audioVersions.bulkGet(versionIds)).filter((v) => v && !v.storagePath)
  if (!pending.length) return
  const { error } = await supabase.from('audio_versions').upsert(
    pending.map((v) => ({
      id: v!.id,
      song_id: v!.songId,
      file_name: v!.label || 'audio',
      label: v!.label,
      duration_ms: v!.durationMs,
      position: v!.sortOrder,
      kind: v!.kind ?? 'mix',
      updated_at: new Date().toISOString(),
    })) as never,
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (error) throw new Error('A song has not reached the cloud yet. Try again in a moment.')
}

// ── The listener's side, no account ────────────────────────────────────────

export async function getCollectionShare(token: string, password?: string): Promise<CollectionPayload> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await rpc('get_collection_share', {
    p_token: token,
    p_password: password?.trim() || null,
  })
  if (error) throw new Error(error.message)
  // A wrong password comes back as { error } rather than raising, so the
  // attempt is kept and counted toward the link's hourly limit (049).
  const failed = (data as { error?: string } | null)?.error
  if (failed) throw new Error(failed)
  return data as CollectionPayload
}

export async function recordCollectionListen(token: string) {
  if (!supabase) return
  await rpc('record_collection_listen', { p_token: token })
}

export async function addCollectionComment(
  token: string,
  options: { password?: string; versionId: string; timestampMs: number; body: string; authorName?: string },
) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await rpc('add_collection_comment', {
    p_token: token,
    p_password: options.password?.trim() || null,
    p_version_id: options.versionId,
    p_timestamp_ms: Math.max(0, Math.round(options.timestampMs)),
    p_body: options.body.trim(),
    p_author_name: options.authorName?.trim() || 'Guest',
  })
  if (error) throw new Error(error.message)
}

/**
 * A collection's cover, signed for ten minutes by the share-audio function.
 * Null when there is none. Track URLs come from ShareUrlCache in
 * lib/share/shareAudio (the page streams them: a master is often a 60 MB WAV).
 * The saved-links row has no password, so a locked link keeps its generated
 * art there.
 */
export async function shareCoverUrl(token: string, password?: string): Promise<string | null> {
  const { coverUrl } = await fetchShareAudio({ kind: 'collection', token, password, cover: true })
  return coverUrl
}

/** A one-off URL that saves the file under `name`. Refused when downloads are off. */
export async function shareDownloadUrl(
  token: string,
  storagePath: string,
  name: string,
  password?: string,
): Promise<string> {
  const { urls } = await fetchShareAudio({ kind: 'collection', token, password, paths: [storagePath], download: name })
  const url = urls[storagePath]
  if (!url) throw new Error('Could not open that file')
  return url
}

/**
 * Upload a cover for a collection: centre-cropped square, 1200px, JPEG.
 * Phone photos arrive at 4000px and 5 MB; a cover never needs more than this,
 * and a listener on 4G should not download a camera original to see it.
 * Stored in your own folder, so the upload rule and your quota apply as usual.
 */
export async function uploadCollectionCover(file: File): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const userId = await getBoardUserId()
  if (!userId) throw new Error('Sign in to add a cover')

  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(1200, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error('Could not read that image')

  const path = `${userId}/covers/${createId()}.jpg`
  const { error } = await supabase.storage.from('audio').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw new Error('The cover did not upload. Try again, or send without one.')
  return path
}
