import { supabase } from '@/lib/supabase/client'

export interface ShareListenComment {
  id: string
  timestamp_ms: number
  body: string
  author_name: string
  created_at: string
}

export interface ShareListenPayload {
  song_title: string
  version_label: string
  duration_ms: number
  storage_path: string
  allow_download: boolean
  password_required: boolean
  comments?: ShareListenComment[]
}

export async function createSongShare(
  songId: string,
  options: {
    allowDownload?: boolean
    password?: string
    versionId?: string
    label?: string
  } = {},
) {
  if (!supabase) throw new Error('Cloud sync is not configured')

  const { data, error } = await supabase.rpc('create_song_share', {
    p_song_id: songId,
    p_allow_download: options.allowDownload ?? false,
    p_password: options.password?.trim() || null,
    p_version_id: options.versionId ?? null,
    p_label: options.label?.trim() || null,
  })

  if (error) throw error
  return `${window.location.origin}/share/${data as string}`
}

export interface SongShareRow {
  id: string
  token: string
  created_at: string
  allow_download: boolean
  password_required: boolean
  expires_at: string | null
  listen_count: number
  last_listened_at: string | null
  view_count: number
  last_viewed_at: string | null
  label: string | null
}

export function shareUrlFromToken(token: string) {
  return `${window.location.origin}/share/${token}`
}

export async function listSongShares(songId: string) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('song_shares')
    .select(
      'id, token, created_at, allow_download, password_hash, expires_at, listen_count, last_listened_at, view_count, last_viewed_at, label',
    )
    .eq('song_id', songId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as Array<SongShareRow & { password_hash: string | null }>).map(
    ({ password_hash, ...row }) => ({
      ...row,
      password_required: password_hash != null,
    }),
  )
}

export interface SongShareFeedbackComment {
  id: string
  share_id: string
  timestamp_ms: number
  body: string
  author_name: string
  created_at: string
}

export async function listSongShareFeedback(songId: string) {
  if (!supabase) return []

  const shares = await listSongShares(songId)
  if (!shares.length) return []

  const shareIds = shares.map((share) => share.id)
  const { data: comments, error: commentsError } = await supabase
    .from('share_listen_comments')
    .select('id, share_id, timestamp_ms, body, author_name, created_at')
    .in('share_id', shareIds)
    .order('timestamp_ms', { ascending: true })

  if (commentsError) throw commentsError

  return (comments ?? []) as SongShareFeedbackComment[]
}

export async function recordShareListen(token: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('record_share_listen', { p_token: token })
  if (error) throw error
}

export async function recordShareView(token: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('record_share_view', { p_token: token })
  if (error) throw error
}

export async function updateSongShareLabel(token: string, label: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await supabase.rpc('update_song_share_label', {
    p_token: token,
    p_label: label.trim(),
  })
  if (error) throw error
}

export async function renewSongShare(token: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await supabase.rpc('renew_song_share', { p_token: token })
  if (error) throw error
  return data as string
}

export async function revokeSongShare(token: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { error } = await supabase.rpc('revoke_song_share', { p_token: token })
  if (error) throw error
}

export async function revokeAllSongShares(songId: string) {
  const shares = await listSongShares(songId)
  for (const share of shares) {
    await revokeSongShare(share.token)
  }
  return shares.length
}

export async function getSongShareListen(token: string, password?: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')

  const { data, error } = await supabase.rpc('get_song_share_listen', {
    p_token: token,
    p_password: password?.trim() || null,
  })

  if (error) throw error
  return data as unknown as ShareListenPayload
}

export async function addShareListenComment(
  token: string,
  options: {
    password?: string
    timestampMs: number
    body: string
    authorName?: string
  },
) {
  if (!supabase) throw new Error('Cloud sync is not configured')

  const { data, error } = await supabase.rpc('add_share_listen_comment', {
    p_token: token,
    p_password: options.password?.trim() || null,
    p_timestamp_ms: Math.max(0, Math.round(options.timestampMs)),
    p_body: options.body.trim(),
    p_author_name: options.authorName?.trim() || 'Guest',
  })

  if (error) throw error
  return data as string
}

export async function downloadSharedAudio(storagePath: string) {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await supabase.storage.from('audio').download(storagePath)
  if (error) throw error
  return data
}
