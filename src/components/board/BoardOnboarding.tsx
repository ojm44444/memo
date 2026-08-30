import { useLiveQuery } from 'dexie-react-hooks'
import { ImportGuide } from '@/components/import/ImportGuide'
import { db } from '@/db/database'
import { getAllSongs } from '@/db/repositories/boardRepo'
import { useBoardRole } from '@/hooks/useBoardRole'

interface BoardOnboardingProps {
  readOnly?: boolean
}

/**
 * Two different empty boards, and they were being treated as one.
 *
 * getAllSongs() filters by the ACTIVE PROJECT, so switching to an empty
 * project looked identical to a brand new account: Owen has 244 songs and was
 * still shown the full "Bring the pile in" welcome. Being told how to get
 * started by software you have used for months is insulting.
 *
 * The welcome now keys off whether the PERSON is new (no songs anywhere at
 * all), not whether this project happens to be empty.
 */
export function BoardOnboarding({ readOnly = false }: BoardOnboardingProps) {
  const boardRole = useBoardRole()
  const songsHere = useLiveQuery(() => getAllSongs(), [])
  // Unfiltered: every song on the account, regardless of project or filters.
  const songsAnywhere = useLiveQuery(
    () => db.songs.filter((s) => !s.deletedAt).count(),
    [],
  )

  const projectEmpty = (songsHere?.length ?? 0) === 0
  if (!projectEmpty) return null
  if (songsAnywhere === undefined) return null

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

  // An established user looking at an empty project wants one line, not a
  // tutorial. They already know how this works.
  if (songsAnywhere > 0) {
    return (
      <div className="board-onboarding is-quiet">
        <p className="board-onboarding-quiet">
          Nothing in this project yet. Drop audio anywhere on the board, or switch project up top.
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
