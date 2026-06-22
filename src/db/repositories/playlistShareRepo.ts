import { supabase } from '@/lib/supabase/client'
import { resolveBoardId } from '@/lib/supabase/boardAccess'
import { getBoardUserId } from '@/lib/auth/session'

export interface PlaylistShareSong {
  song_id: string
  position: number
  title: string
  version_label: string
  duration_ms: number
  storage_path: string
}

export interface PlaylistSharePayload {
  label: string | null
  allow_download: boolean
  songs: PlaylistShareSong[]
}

export async function createPlaylistShare(
  songIds: string[],
  options: { label?: string; allowDownload?: boolean } = {},
): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured')

  const userId = await getBoardUserId()
  if (!userId) throw new Error('Sign in to create a share link')

  const boardId = await resolveBoardId(userId)
  if (!boardId) throw new Error('Board not found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('create_playlist_share', {
    p_board_id: boardId,
    p_song_ids: songIds,
    p_label: options.label?.trim() || null,
    p_allow_download: options.allowDownload ?? false,
  })

  if (error) throw error
  return `${window.location.origin}/playlist/${data as string}`
}

export async function getPlaylistShareListen(token: string): Promise<PlaylistSharePayload> {
  if (!supabase) throw new Error('Cloud sync is not configured')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_playlist_share_listen', {
    p_token: token,
  })

  if (error) throw error
  return data as unknown as PlaylistSharePayload
}

export async function downloadPlaylistAudio(storagePath: string): Promise<Blob> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await supabase.storage.from('audio').download(storagePath)
  if (error) throw error
  return data
}
