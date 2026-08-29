import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getTrashedSongs,
  restoreSong,
  purgeSongForGood,
  daysLeft,
} from '@/db/repositories/trashRepo'

/**
 * Trash, in the Library. Copy is the BD's, verbatim where it was specced.
 * The confirm step is inline on the row rather than a modal: a modal for a
 * destructive action invites a reflex "confirm" click; an inline swap makes
 * the second click land in a different place from the first.
 */
export function TrashSection({ readOnly }: { readOnly?: boolean }) {
  const trashed = useLiveQuery(() => getTrashedSongs(), [])
  const [confirming, setConfirming] = useState<string | null>(null)

  if (readOnly) return null

  return (
    <section className="library-trash" aria-label="Trash">
      <div className="library-trash-header">
        <h3 className="library-trash-title">Trash</h3>
      </div>
      {(trashed?.length ?? 0) === 0 ? (
        <p className="library-trash-empty">
          Nothing in here. Deleted songs wait 30 days before they go for good.
        </p>
      ) : (
        <ul className="library-trash-list">
          {trashed!.map((song) => (
            <li key={song.id} className="library-trash-row">
              <div className="library-trash-info">
                <span className="library-trash-name">{song.title}</span>
                <span className="library-trash-meta">
                  Deleted{' '}
                  {new Date(song.deletedAt!).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                  . Goes for good in {daysLeft(song.deletedAt!)}{' '}
                  {daysLeft(song.deletedAt!) === 1 ? 'day' : 'days'}.
                </span>
              </div>
              {confirming === song.id ? (
                <div className="library-trash-confirm">
                  <span className="library-trash-confirm-text">
                    Delete for good? This one is not recoverable.
                  </span>
                  <button
                    type="button"
                    className="library-trash-purge is-armed"
                    onClick={() => {
                      setConfirming(null)
                      void purgeSongForGood(song.id)
                    }}
                  >
                    Delete for good
                  </button>
                  <button
                    type="button"
                    className="library-trash-restore"
                    onClick={() => setConfirming(null)}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="library-trash-actions">
                  <button
                    type="button"
                    className="library-trash-restore"
                    onClick={() => void restoreSong(song.id)}
                  >
                    Put it back
                  </button>
                  <button
                    type="button"
                    className="library-trash-purge"
                    onClick={() => setConfirming(song.id)}
                  >
                    Delete for good
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
