import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getPlaylists,
  createPlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  getSongPlaylistIds,
} from '@/db/repositories/playlistRepo'

interface AddToPlaylistModalProps {
  songId: string
  onClose: () => void
}

export function AddToPlaylistModal({ songId, onClose }: AddToPlaylistModalProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const playlists = useLiveQuery(() => getPlaylists(), [])
  const memberIds = useLiveQuery(() => getSongPlaylistIds(songId), [songId])

  const toggle = async (playlistId: string) => {
    if (busy) return
    setBusy(playlistId)
    try {
      if (memberIds?.includes(playlistId)) {
        await removeSongFromPlaylist(playlistId, songId)
      } else {
        await addSongToPlaylist(playlistId, songId)
      }
    } finally {
      setBusy(null)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy('new')
    try {
      const pl = await createPlaylist(name)
      await addSongToPlaylist(pl.id, songId)
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
          <span className="add-playlist-title">Add to playlist</span>
          <button type="button" className="add-playlist-close" onClick={onClose}>✕</button>
        </div>

        <div className="add-playlist-list">
          {playlists?.length === 0 && !creating && (
            <p className="add-playlist-empty">No playlists yet</p>
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
                <span className="add-playlist-name">{pl.name}</span>
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
