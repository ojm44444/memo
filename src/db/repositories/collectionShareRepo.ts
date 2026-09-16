import { supabase } from '@/lib/supabase/client'
import { resolveBoardId } from '@/lib/supabase/boardAccess'
import { getBoardUserId } from '@/lib/auth/session'
import type { ShareLifetimeDays } from '@/db/repositories/shareRepo'

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
  tracks: CollectionTrack[]
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
  } = {},
): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const userId = await getBoardUserId()
  if (!userId) throw new Error('Sign in to share')
  const boardId = await resolveBoardId(userId)
  if (!boardId) throw new Error('Board not found')

  const { data, error } = await rpc('create_collection_share', {
    p_board_id: boardId,
    p_items: items.map((item) => ({ song_id: item.songId, version_id: item.versionId })),
    p_title: options.title?.trim() || null,
    p_artist: options.artist?.trim() || null,
    p_allow_download: options.allowDownload ?? false,
    p_expires_in_days: options.expiresInDays ?? 90,
    p_password: options.password?.trim() || null,
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

// ── The listener's side, no account ────────────────────────────────────────

export async function getCollectionShare(token: string, password?: string): Promise<CollectionPayload> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await rpc('get_collection_share', {
    p_token: token,
    p_password: password?.trim() || null,
  })
  if (error) throw new Error(error.message)
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
 * A streamable URL for one shared file. Streaming rather than downloading the
 * whole thing first: a master is often a 60 MB WAV, and a label listening on
 * a phone should hear the first bar in a second, not after the whole file.
 * The storage rule still decides: this only signs a file the link releases.
 */
export async function signedTrackUrl(storagePath: string, download?: string): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(storagePath, 60 * 60 * 6, download ? { download } : undefined)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not open that file')
  return data.signedUrl
}
