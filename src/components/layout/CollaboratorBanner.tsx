import { useBoardRole } from '@/hooks/useBoardRole'

export function CollaboratorBanner() {
  const role = useBoardRole()

  if (role === 'viewer') {
    return (
      <div className="board-collaborator-banner" role="status">
        View-only — you can listen and comment, but can&apos;t move songs or edit the board.
      </div>
    )
  }

  if (role === 'editor') {
    return (
      <div className="board-collaborator-banner" role="status">
        Editor — listen and leave comments; board edits come from the project owner.
      </div>
    )
  }

  return null
}
