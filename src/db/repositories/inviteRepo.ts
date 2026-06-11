import { db } from '@/db/database'
import { supabase } from '@/lib/supabase/client'
import { scheduleFlush } from '@/sync/syncEngine'

export interface BoardMemberRow {
  id: string
  role: string
  created_at: string
  user_id: string
}

export async function listBoardMembers(boardId: string) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('board_members')
    .select('id, role, created_at, user_id')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as BoardMemberRow[]
}

export interface BoardInviteRow {
  id: string
  token: string
  role: 'viewer' | 'editor'
  invitee_email: string | null
  created_at: string
  expires_at: string | null
}

export async function createBoardInvite(
  boardId: string,
  role: 'viewer' | 'editor' = 'editor',
  inviteeEmail?: string,
) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Sign in required')

  const email = inviteeEmail?.trim().toLowerCase() || null

  const { data, error } = await supabase
    .from('board_invites')
    .insert({
      board_id: boardId,
      created_by: user.user.id,
      role,
      invitee_email: email,
    })
    .select('token')
    .single()

  if (error) throw error

  return `${window.location.origin}/invite/${data.token}`
}

export async function listBoardInvites(boardId: string) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('board_invites')
    .select('id, token, role, invitee_email, created_at, expires_at')
    .eq('board_id', boardId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as BoardInviteRow[]
}

export async function removeBoardMember(memberId: string) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.from('board_members').delete().eq('id', memberId)
  if (error) throw error
}

export async function revokeBoardInvite(inviteId: string) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('board_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (error) throw error
}

export async function getInvitePreview(token: string) {
  if (!supabase) return null

  const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token })
  if (error || !data?.length) return null

  const row = data[0] as { board_name: string; board_id: string }
  return { boardName: row.board_name, boardId: row.board_id }
}

export async function acceptBoardInvite(token: string) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: boardId, error } = await supabase.rpc('accept_board_invite', { p_token: token })
  if (error) throw error

  await db.syncMeta.put({ key: 'boardId', value: boardId as string })
  await db.syncMeta.put({ key: 'lastPulledAt', value: new Date(0).toISOString() })
  scheduleFlush()

  return boardId as string
}

export async function sendBoardInviteEmail(options: {
  to: string
  link: string
  boardName: string
  inviterName?: string
}) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.functions.invoke('send-invite-email', {
    body: options,
  })

  if (error) throw error
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
}

export function buildInviteMailto(link: string, boardName: string, inviteeEmail?: string) {
  const subject = encodeURIComponent(`Join ${boardName} on mem•`)
  const body = encodeURIComponent(
    `Hey — I'm sharing our songwriting board on mem•.\n\nOpen this link and sign in to join:\n${link}\n\n— sent from mem•`,
  )
  const to = inviteeEmail ? encodeURIComponent(inviteeEmail) : ''
  return `mailto:${to}?subject=${subject}&body=${body}`
}
