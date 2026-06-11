import { clearLocalUserBoard } from '@/db/clearLocalUserBoard'
import { db } from '@/db/database'
import { supabase } from '@/lib/supabase/client'
import { usePlayerStore } from '@/stores/playerStore'
import { flush } from '@/sync/syncEngine'

export type BoardRole = 'owner' | 'viewer' | 'editor' | null

export interface AccessibleBoard {
  id: string
  name: string
  role: BoardRole
}

/** Resolve the canonical (oldest) board for this user from Supabase. */
export async function resolveBoardId(userId: string): Promise<string | null> {
  if (!supabase) return null

  const { data: owned, error: ownedError } = await supabase
    .from('boards')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (ownedError) throw ownedError

  if (owned?.[0]?.id) {
    await db.syncMeta.put({ key: 'boardId', value: owned[0].id })
    return owned[0].id
  }

  const { data: membership, error: memberError } = await supabase
    .from('board_members')
    .select('board_id')
    .eq('user_id', userId)
    .limit(1)

  if (memberError) throw memberError

  if (membership?.[0]?.board_id) {
    await db.syncMeta.put({ key: 'boardId', value: membership[0].board_id })
    return membership[0].board_id
  }

  await db.syncMeta.delete('boardId')
  return null
}

export async function getBoardRole(userId: string, boardId: string): Promise<BoardRole> {
  if (!supabase) return null

  const { data: board } = await supabase
    .from('boards')
    .select('user_id')
    .eq('id', boardId)
    .maybeSingle()

  if (board?.user_id === userId) return 'owner'

  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .maybeSingle()

  return (member?.role as BoardRole) ?? null
}

export async function userOwnsBoard(userId: string, boardId: string) {
  return (await getBoardRole(userId, boardId)) === 'owner'
}

export async function listAccessibleBoards(userId: string): Promise<AccessibleBoard[]> {
  if (!supabase) return []

  const byId = new Map<string, AccessibleBoard>()

  const { data: owned, error: ownedError } = await supabase
    .from('boards')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (ownedError) throw ownedError

  for (const board of owned ?? []) {
    byId.set(board.id, { id: board.id, name: board.name, role: 'owner' })
  }

  const { data: memberships, error: memberError } = await supabase
    .from('board_members')
    .select('board_id, role')
    .eq('user_id', userId)

  if (memberError) throw memberError

  const memberBoardIds = (memberships ?? [])
    .map((row) => row.board_id)
    .filter((boardId) => !byId.has(boardId))

  if (memberBoardIds.length > 0) {
    const { data: memberBoards, error: boardsError } = await supabase
      .from('boards')
      .select('id, name')
      .in('id', memberBoardIds)

    if (boardsError) throw boardsError

    const roleByBoardId = new Map(
      (memberships ?? []).map((row) => [row.board_id, row.role as BoardRole]),
    )

    for (const board of memberBoards ?? []) {
      if (byId.has(board.id)) continue
      byId.set(board.id, {
        id: board.id,
        name: board.name,
        role: roleByBoardId.get(board.id) ?? 'viewer',
      })
    }
  }

  return [...byId.values()]
}

export async function switchToBoard(boardId: string) {
  const current = (await db.syncMeta.get('boardId'))?.value
  if (current === boardId) return

  usePlayerStore.getState().stop()
  await clearLocalUserBoard()
  await db.syncMeta.put({ key: 'boardId', value: boardId })
  await db.syncMeta.put({ key: 'lastPulledAt', value: new Date(0).toISOString() })
  await flush()
}
