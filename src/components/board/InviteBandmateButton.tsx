import { useEffect, useRef, useState } from 'react'
import {
  buildInviteMailto,
  createBoardInvite,
  sendBoardInviteEmail,
  listBoardInvites,
  listBoardMembers,
  removeBoardMember,
  revokeBoardInvite,
  type BoardInviteRow,
  type BoardMemberRow,
} from '@/db/repositories/inviteRepo'
import { db } from '@/db/database'
import { useBoardRole } from '@/hooks/useBoardRole'
import { getProjectName } from '@/db/repositories/projectRepo'
import { useUiStore } from '@/stores/uiStore'

type InviteRole = 'viewer' | 'editor'

export function InviteBandmateButton() {
  const boardRole = useBoardRole()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const drawerOpen = useUiStore((s) => s.drawerOpen)

  useEffect(() => {
    if (drawerOpen) setOpen(false)
  }, [drawerOpen])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])
  const [role, setRole] = useState<InviteRole>('viewer')
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<BoardInviteRow[]>([])
  const [members, setMembers] = useState<BoardMemberRow[]>([])
  const [boardId, setBoardId] = useState<string | null>(null)

  const refreshPanel = async (id: string) => {
    const [invites, memberRows] = await Promise.all([listBoardInvites(id), listBoardMembers(id)])
    setPending(invites)
    setMembers(memberRows)
  }

  useEffect(() => {
    if (!open) return
    void (async () => {
      const id = (await db.syncMeta.get('boardId'))?.value ?? null
      setBoardId(id)
      if (id) await refreshPanel(id)
    })()
  }, [open])

  const createInvite = async () => {
    setError(null)
    setLoading(true)
    try {
      const id = (await db.syncMeta.get('boardId'))?.value
      if (!id) throw new Error('Sync your board first (sign in + go online once)')
      const link = await createBoardInvite(id, role, email || undefined)
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      await refreshPanel(id)
      return link
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invite')
      return null
    } finally {
      setLoading(false)
    }
  }

  const copyInvite = async () => {
    await createInvite()
  }

  const sendEmail = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Enter an email to send the invite')
      return
    }

    const link = await createInvite()
    if (!link) return

    const boardName = (await getProjectName()) || 'our project'
    setEmailSent(false)

    try {
      await sendBoardInviteEmail({ to: trimmed, link, boardName })
      setEmailSent(true)
      setError(null)
      setTimeout(() => setEmailSent(false), 4000)
    } catch {
      window.location.href = buildInviteMailto(link, boardName, trimmed)
    }
  }

  const revokeInvite = async (inviteId: string) => {
    if (!boardId) return
    await revokeBoardInvite(inviteId)
    await refreshPanel(boardId)
  }

  const removeMember = async (memberId: string) => {
    if (!boardId) return
    await removeBoardMember(memberId)
    await refreshPanel(boardId)
  }

  if (boardRole !== 'owner') return null

  return (
    <div className="invite-bandmate" ref={panelRef}>
      <button
        type="button"
        className="invite-bandmate-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Invite
        {pending.length > 0 && <span className="invite-bandmate-badge">{pending.length}</span>}
      </button>

      {open && (
        <div className="invite-bandmate-panel">
          <p className="invite-bandmate-title">Invite a bandmate</p>
          <p className="invite-bandmate-sub">
            They sign in with the link and see this project board.
          </p>

          <label className="invite-bandmate-role">
            <span>Email (optional)</span>
            <input
              type="email"
              className="invite-bandmate-email"
              placeholder="bandmate@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="invite-bandmate-role">
            <span>Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
              className="invite-bandmate-select"
            >
              <option value="viewer">Viewer — read only, can't edit</option>
              <option value="editor">Editor — can reorder & edit</option>
            </select>
          </label>

          <div className="invite-bandmate-actions">
            <button
              type="button"
              className="invite-bandmate-copy"
              onClick={() => void copyInvite()}
              disabled={loading}
            >
              {loading ? 'Creating…' : copied ? 'Link copied!' : 'Copy invite link'}
            </button>
            <button
              type="button"
              className="invite-bandmate-email-btn"
              onClick={() => void sendEmail()}
              disabled={loading}
            >
              Send email
            </button>
          </div>

          {members.length > 0 && (
            <div className="invite-bandmate-members">
              <span className="invite-bandmate-members-label">On this board</span>
              <ul className="invite-bandmate-members-list">
                {members.map((member) => (
                  <li key={member.id} className="invite-bandmate-member-item">
                    <div>
                      <span className="invite-bandmate-pending-role">{member.role}</span>
                      <span className="invite-bandmate-member-date">
                        joined {new Date(member.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="invite-bandmate-revoke"
                      onClick={() => void removeMember(member.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pending.length > 0 && (
            <ul className="invite-bandmate-pending">
              {pending.map((invite) => (
                <li key={invite.id} className="invite-bandmate-pending-item">
                  <div>
                    <span className="invite-bandmate-pending-email">
                      {invite.invitee_email || 'Link invite'}
                    </span>
                    <span className="invite-bandmate-pending-role">{invite.role}</span>
                  </div>
                  <button
                    type="button"
                    className="invite-bandmate-revoke"
                    onClick={() => void revokeInvite(invite.id)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}

          {emailSent && <p className="invite-bandmate-success">Invite email sent.</p>}
          {error && <p className="invite-bandmate-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
