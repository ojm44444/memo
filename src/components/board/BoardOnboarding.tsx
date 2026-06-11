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
      <h3>Your songwriting board is ready</h3>
      <ol>
        <li>
          <strong>Import a memo</strong> — tap <em>+ Import audio</em> in Inbox (or drag from Finder on
          Mac).
        </li>
        {supabaseConfigured && (
          <li>
            <strong>Sign in to sync</strong> — memos upload to the cloud and appear on your other
            devices. <Link to="/sign-in">Sign in →</Link>
          </li>
        )}
        <li>
          <strong>Organise</strong> — drag songs between sections, add tags, rename titles, and play
          through a column.
        </li>
        <li>
          <strong>Share demos</strong> — when a take is ready, open a song and create a password-protected
          listen link with timestamped feedback.
        </li>
      </ol>
    </div>
  )
}
