import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getDuplicateNameGroups,
  resolveDuplicateNameGroup,
} from '@/db/repositories/projectRepo'

/**
 * Surfaces duplicate project names and offers the safe half of the cleanup.
 *
 * Two projects called "My Project" — one with 235 songs, one with none — is
 * what made the project switcher unreadable. Nothing on screen said which was
 * which, so the fix is to name the problem and remove the empty one.
 *
 * Deliberately does NOT merge two non-empty projects. That is a destructive
 * decision about someone's songs and belongs to them, not to a tidy-up button,
 * so in that case this explains the situation and stops.
 */
/**
 * "Not now" used to be component state, so it lasted until the component
 * unmounted, which is the next time you switch Songwriting to Listen and
 * back. A dismissal that returns within one click is worse than no dismissal:
 * it reads as the app ignoring you. Keyed by name rather than by a single
 * flag so dismissing one duplicate pair does not hide a different one.
 */
const DISMISSED_KEY = 'dupe-project-dismissed'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function DuplicateProjectNotice() {
  const groups = useLiveQuery(() => getDuplicateNameGroups(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const persistDismissed = (next: string[]) => {
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      /* private mode: the dismissal is still good for this session */
    }
  }

  const visible = (groups ?? []).filter((g) => !dismissed.includes(g.name))
  if (visible.length === 0) return null

  return (
    <>
      {visible.map((group) => {
        const nonEmpty = group.projects.filter((p) => p.songCount > 0)
        const canAutoResolve = nonEmpty.length <= 1
        const emptyCount = group.projects.length - nonEmpty.length

        return (
          <div key={group.name} className="dupe-project-notice" role="status">
            <div className="dupe-project-text">
              <strong>
                You have {group.projects.length} projects called “{group.name}”.
              </strong>{' '}
              {canAutoResolve ? (
                <>
                  {emptyCount === 1 ? 'One is empty' : `${emptyCount} are empty`}, which is why the
                  project switcher looks like it is showing the same thing twice.
                </>
              ) : (
                <>
                  More than one has songs in it, so nothing will be removed automatically. Rename
                  one of them to tell them apart.
                </>
              )}
            </div>

            <div className="dupe-project-actions">
              {canAutoResolve && (
                <button
                  type="button"
                  className="dupe-project-fix"
                  disabled={busy === group.name}
                  onClick={() => {
                    setBusy(group.name)
                    void resolveDuplicateNameGroup(group.name).finally(() => setBusy(null))
                  }}
                >
                  {busy === group.name
                    ? 'Removing…'
                    : `Remove the empty ${emptyCount === 1 ? 'one' : 'ones'}`}
                </button>
              )}
              <button
                type="button"
                className="dupe-project-dismiss"
                onClick={() => persistDismissed([...dismissed, group.name])}
              >
                Not now
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
