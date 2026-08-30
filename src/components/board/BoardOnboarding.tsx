import { useLiveQuery } from 'dexie-react-hooks'
import { ImportGuide } from '@/components/import/ImportGuide'
import { getAllSongs } from '@/db/repositories/boardRepo'
import { useBoardRole } from '@/hooks/useBoardRole'

interface BoardOnboardingProps {
  readOnly?: boolean
}

export function BoardOnboarding({ readOnly = false }: BoardOnboardingProps) {
  const boardRole = useBoardRole()
  const songs = useLiveQuery(() => getAllSongs(), [])
  const isEmpty = (songs?.length ?? 0) === 0

  if (!isEmpty) return null

  if (readOnly || boardRole === 'viewer' || boardRole === 'editor') {
    return (
      <div className="board-onboarding">
        <h3>Shared project board</h3>
        <p className="board-onboarding-lead">
          Songs will appear here when the project owner adds memos. You can listen, leave comments on
          any song, and use Listen mode for favourites.
        </p>
      </div>
    )
  }

  return (
    <div className="board-onboarding">
      <ImportGuide />
    </div>
  )
}
