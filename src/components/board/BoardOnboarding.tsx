import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { getAllSongs } from '@/db/repositories/boardRepo'
import { useBoardRole } from '@/hooks/useBoardRole'
import { supabaseConfigured } from '@/lib/supabase/client'

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
      {/* B6, the import screen, honest version (brief 05, BD-amended heading).
          The honesty line is the point: pretending an app can read the Voice
          Memos library is how competitors get mauled, and the Files route
          genuinely takes about two minutes for a big pile. */}
      <h3>Bring the pile in.</h3>
      <p className="board-onboarding-lead">
        Drop a folder, or pull them from Files. Nothing leaves your device unless you sign in.
      </p>
      <ol>
        <li>
          <strong>On a Mac</strong>, link your Voice Memos folder and everything synced to this
          Mac imports, plus every new memo after.
        </li>
        <li>
          <strong>On your iPhone</strong>, in Voice Memos select your recordings, Save to Files,
          then import them into songdrafts in one go from Files.
        </li>
        <li>
          <strong>From anywhere else</strong>, drag audio straight onto the board.
        </li>
        {supabaseConfigured && (
          <li>
            <strong>Sign in to sync</strong> and your songs appear on your other devices.{' '}
            <Link to="/sign-in">Sign in →</Link>
          </li>
        )}
      </ol>
      <p className="board-onboarding-note">
        No app can read your Voice Memos library directly. Not us, not App Store apps, nobody:
        Apple does not allow it. These are the honest routes, and the Files one takes about two
        minutes for a big pile.
      </p>
    </div>
  )
}
