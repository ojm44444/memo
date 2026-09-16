import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  createListenProject,
  getListenProjects,
  moveSongsToListenProject,
} from '@/db/repositories/listenProjectRepo'
import { scheduleFlush } from '@/sync/syncEngine'

interface AddToPlaylistModalProps {
  songId: string
  onClose: () => void
}

/**
 * "Add to Listen" from a song on the board (17 Sept, Owen). Pick the Listen
 * playlist it belongs in; the song stays on the board too. One playlist per
 * song, so picking another moves it, and picking the ticked one takes it out.
 */
export function AddToPlaylistModal({ songId, onClose }: AddToPlaylistModalProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const playlists = useLiveQuery(() => getListenProjects(), [])
  const current = useLiveQuery(() => db.songs.get(songId).then((s) => s?.listenProjectId ?? null), [songId])
  const memberIds = current ? [current] : []

  const toggle = async (playlistId: string) => {
    if (busy) return
    setBusy(playlistId)
    try {
      await moveSongsToListenProject([songId], current === playlistId ? null : playlistId)
      scheduleFlush()
    } finally {
      setBusy(null)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy('new')
    try {
      const pl = await createListenProject({ title: name })
      await moveSongsToListenProject([songId], pl.id)
      scheduleFlush()
      setNewName('')
      setCreating(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="add-playlist-overlay" role="button" tabIndex={-1} onClick={onClose}>
      <div className="add-playlist-modal" role="dialog" onClick={e => e.stopPropagation()}>
        <div className="add-playlist-header">
          <span className="add-playlist-title">Add to Listen</span>
          <button type="button" className="add-playlist-close" onClick={onClose}>✕</button>
        </div>

        <div className="add-playlist-list">
          {playlists?.length === 0 && !creating && (
            <p className="add-playlist-empty">No Listen playlists yet</p>
          )}
          {playlists?.map(pl => {
            const inPlaylist = memberIds?.includes(pl.id)
            return (
              <button
                key={pl.id}
                type="button"
                className={`add-playlist-row${inPlaylist ? ' add-playlist-row--checked' : ''}`}
                onClick={() => void toggle(pl.id)}
                disabled={busy === pl.id}
              >
                <span className="add-playlist-check">{inPlaylist ? '✓' : ''}</span>
                <span className="add-playlist-name">{pl.title}</span>
              </button>
            )
          })}
        </div>

        {creating ? (
          <div className="add-playlist-create-row">
            <input
              className="add-playlist-input"
              placeholder="Playlist name…"
              value={newName}
              autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
            />
            <button
              type="button"
              className="add-playlist-confirm"
              disabled={!newName.trim() || busy === 'new'}
              onClick={() => void handleCreate()}
            >
              Create
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="add-playlist-new-btn"
            onClick={() => setCreating(true)}
          >
            + New playlist
          </button>
        )}
      </div>
    </div>
  )
}
