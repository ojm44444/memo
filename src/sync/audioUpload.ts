import { getAudioBlob, updateAudioVersionStoragePath } from '@/db/repositories/audioRepo'
import { errorMessage } from '@/lib/errorMessage'
import { INBOX_SLUG } from '@/types/column'
import { supabase } from '@/lib/supabase/client'
import { db } from '@/db/database'

function normalizeAudioMime(mime: string, fileName: string) {
  if (mime && mime !== 'application/octet-stream') return mime
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'm4a' || ext === 'mp4' || ext === 'm4v') return 'audio/mp4'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'aac') return 'audio/aac'
  if (ext === 'caf') return 'audio/x-caf'
  if (ext === 'aiff' || ext === 'aif') return 'audio/aiff'
  return 'audio/mp4'
}

export async function uploadAudioVersion(
  versionId: string,
  userId: string,
  boardId: string,
  payload: {
    songId: string
    fileName: string
    mimeType: string
    durationMs: number
    sortOrder: number
    label: string
    localBlobId: string
  },
) {
  if (!supabase) throw new Error('Supabase not configured')

  const blobRecord = await getAudioBlob(payload.localBlobId)
  if (!blobRecord) throw new Error('Audio file missing on this device — try importing again')

  const ext = payload.fileName.split('.').pop() ?? 'm4a'
  const storagePath = `${userId}/${boardId}/${payload.songId}/${versionId}.${ext}`
  const contentType = normalizeAudioMime(payload.mimeType, payload.fileName)

  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(storagePath, blobRecord.blob, {
      contentType,
      upsert: true,
    })

  if (uploadError) throw uploadError

  const { error: dbError } = await supabase.from('audio_versions').upsert({
    id: versionId,
    song_id: payload.songId,
    storage_path: storagePath,
    file_name: payload.fileName,
    label: payload.label,
    duration_ms: payload.durationMs,
    position: payload.sortOrder,
    updated_at: new Date().toISOString(),
  })

  if (dbError) throw dbError

  await updateAudioVersionStoragePath(versionId, storagePath)
}

async function syncLocalColumnsToBoard(boardId: string) {
  const localColumns = await db.columns.toArray()
  if (localColumns.length === 0 || !supabase) return

  const { error } = await supabase.from('columns').upsert(
    localColumns.map((col) => ({
      id: col.id,
      board_id: boardId,
      slug: col.slug,
      title: col.title,
      position: col.sortOrder,
    })),
    { onConflict: 'board_id,slug' },
  )

  if (error) console.warn('Column sync skipped:', errorMessage(error))
}

async function ensureRemoteColumns(boardId: string) {
  if (!supabase) return

  const { count } = await supabase
    .from('columns')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)

  if (count && count > 0) return

  const localColumns = await db.columns.toArray()
  const defaults =
    localColumns.length > 0
      ? localColumns
      : [{ slug: INBOX_SLUG, title: 'Inbox', sortOrder: 0 }]

  await supabase.from('columns').upsert(
    defaults.map((col, i) => ({
      board_id: boardId,
      slug: col.slug,
      title: col.title,
      position: col.sortOrder ?? i,
    })),
    { onConflict: 'board_id,slug' },
  )
}

async function fetchUserBoard(userId: string) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('boards')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error
  return data?.[0]?.id ?? null
}

/** Retry — Supabase may still be creating the board right after Google sign-in. */
async function fetchUserBoardWithRetry(userId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const boardId = await fetchUserBoard(userId)
    if (boardId) return boardId
    if (attempt < 3) await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

export async function ensureBoardForUser(userId: string): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured')

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    throw new Error('Session expired — please sign out and sign in again')
  }

  const { data: rpcBoardId, error: rpcError } = await supabase.rpc('ensure_my_board')
  let boardId: string | null = typeof rpcBoardId === 'string' ? rpcBoardId : null

  if (rpcError || !boardId) {
    boardId = await fetchUserBoardWithRetry(userId)

    if (!boardId) {
      const { data: board, error: insertError } = await supabase
        .from('boards')
        .insert({ user_id: userId, name: 'My Board' })
        .select('id')
        .single()

      if (insertError) {
        boardId = await fetchUserBoard(userId)
        if (!boardId) throw rpcError ?? insertError
      } else {
        boardId = board.id
      }
    }
  }

  if (!boardId) throw new Error('Could not resolve your board in the cloud')

  await ensureRemoteColumns(boardId)
  await syncLocalColumnsToBoard(boardId)
  await db.syncMeta.put({ key: 'boardId', value: boardId })
  return boardId
}
