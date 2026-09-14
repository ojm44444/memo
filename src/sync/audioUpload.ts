import { getAudioBlob, updateAudioVersionStoragePath } from '@/db/repositories/audioRepo'
import { errorMessage } from '@/lib/errorMessage'
import { INBOX_SLUG } from '@/types/column'
import { supabase } from '@/lib/supabase/client'
import { db } from '@/db/database'
import {
  CLOUD_MAX_BYTES,
  UploadBlockedError,
  canonicalAudioMime,
  classifyStorageRefusal,
  extensionForMime,
} from '@/lib/cloudAudio'


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

  const contentType = canonicalAudioMime(payload.mimeType, payload.fileName)
  // A real extension from the filename, or one derived from the type: the
  // duplicate path names files "<label>.audio", which is not an extension.
  const fromName = payload.fileName.includes('.') ? payload.fileName.split('.').pop()!.toLowerCase() : ''
  const ext = /^[a-z0-9]{2,5}$/.test(fromName) && fromName !== 'audio' ? fromName : extensionForMime(contentType)
  const storagePath = `${userId}/${boardId}/${payload.songId}/${versionId}.${ext}`

  // Refused before sending: retrying a file the bucket will never take only
  // burns five attempts and then drops the job, which is how takes used to
  // end up on one device forever without anyone being told.
  if (blobRecord.blob.size > CLOUD_MAX_BYTES) {
    throw new UploadBlockedError(
      'too_large',
      `This take is ${Math.round(blobRecord.blob.size / 1048576)} MB, over the cloud's ${Math.round(CLOUD_MAX_BYTES / 1048576)} MB limit, so it stays on this device.`,
    )
  }

  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(storagePath, blobRecord.blob, {
      contentType,
      upsert: true,
    })

  if (uploadError) {
    // The quota policy (migration 017) refuses the insert at the database, so
    // this surfaces as an RLS violation. Translate it into something true and
    // actionable instead of leaking "new row violates row-level security".
    const msg = String(uploadError.message ?? '')
    const blocked = classifyStorageRefusal(msg)
    if (blocked) throw new UploadBlockedError(blocked, msg)
    /* Only a row-level security refusal means the quota. This used to match
       any 42501 as well, but 42501 is also "permission denied", which is what
       every upload failed with from 26 Aug (see migration 029): the app would
       have told people their storage was full when it was not. A server fault
       is passed through as itself. */
    if (/row-level security/i.test(msg) && !/permission denied/i.test(msg)) {
      throw new Error(
        'Cloud storage is full, so this take stayed on your device. ' +
          'Your music is safe and still plays here. Free up space by removing ' +
          'old takes from the cloud, or export and delete what you no longer need.',
      )
    }
    throw uploadError
  }

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
  // Same reason as boardAccess.setBoardIdIfChanged: an unconditional put
  // re-emits to every liveQuery watching syncMeta.
  if ((await db.syncMeta.get('boardId'))?.value !== boardId) {
    await db.syncMeta.put({ key: 'boardId', value: boardId })
  }
  return boardId
}
