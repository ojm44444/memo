import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getPlaylists, createPlaylist, getPlaylistSongs } from '@/db/repositories/playlistRepo'
import { PlaylistDetail } from './PlaylistDetail'

export function PlaylistsView() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const playlists = useLiveQuery(() => getPlaylists(), [])

  // Count songs per playlist
  const counts = useLiveQuery(async () => {
    if (!playlists) return {}
    const entries = await Promise.all(
      playlists.map(async pl => {
        const songs = await getPlaylistSongs(pl.id)
        return [pl.id, songs.length] as const
      })
    )
    return Object.fromEntries(entries)
  }, [playlists?.map(p => p.id).join(',')])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const pl = await createPlaylist(name)
    setNewName('')
    setCreating(false)
    setActiveId(pl.id)
  }

  if (activeId) {
    return <PlaylistDetail playlistId={activeId} onBack={() => setActiveId(null)} />
  }

  return (
    <div className="playlists-view">
      <div className="playlists-header">
        <h2 className="playlists-title">Playlists</h2>
        <button type="button" className="playlists-new-btn" onClick={() => setCreating(true)}>
          + New
        </button>
      </div>

      {creating && (
        <div className="playlists-create-row">
          <input
            className="playlists-create-input"
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
            className="playlists-create-confirm"
            disabled={!newName.trim()}
            onClick={() => void handleCreate()}
          >
            Create
          </button>
          <button
            type="button"
            className="playlists-create-cancel"
            onClick={() => { setCreating(false); setNewName('') }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="playlists-list">
        {playlists?.map(pl => (
          <button
            key={pl.id}
            type="button"
            className="playlists-row"
            onClick={() => setActiveId(pl.id)}
          >
            <div className="playlists-row-icon">♫</div>
            <div className="playlists-row-info">
              <span className="playlists-row-name">{pl.name}</span>
              <span className="playlists-row-count">{counts?.[pl.id] ?? 0} songs</span>
            </div>
            <span className="playlists-row-chevron">›</span>
          </button>
        ))}

        {playlists?.length === 0 && !creating && (
          <div className="playlists-empty">
            <p>No playlists yet.</p>
            <p>Open any song and tap "Add to playlist" to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
