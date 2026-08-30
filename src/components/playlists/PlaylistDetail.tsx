import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  getPlaylist,
  getPlaylistSongs,
  removeSongFromPlaylist,
  renamePlaylist,
  deletePlaylist,
} from '@/db/repositories/playlistRepo'
import { CachedWaveform } from '@/components/audio/CachedWaveform'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { playSongVersion } from '@/lib/playSongVersion'
import { playAudioImmediately, unlockAudioEl } from '@/lib/audio/globalAudioEl'
import { getCachedUrl } from '@/lib/audio/resolvePlaybackUrl'
import { formatDuration } from '@/lib/audio-utils'

interface PlaylistDetailProps {
  playlistId: string
  onBack: () => void
}

export function PlaylistDetail({ playlistId, onBack }: PlaylistDetailProps) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const playlist = useLiveQuery(() => getPlaylist(playlistId), [playlistId])
  const rows = useLiveQuery(() => getPlaylistSongs(playlistId), [playlistId])
  const { currentSongId, isPlaying, setPlaying } = usePlayerStore()
  const openDrawer = useUiStore(s => s.openDrawer)

  // Resolve song + primary version for each row
  const songData = useLiveQuery(async () => {
    if (!rows) return []
    return Promise.all(rows.map(async row => {
      const song = await db.songs.get(row.songId)
      if (!song) return null
      const versions = await db.audioVersions.where('songId').equals(row.songId).sortBy('sortOrder')
      const primary = versions[0] ?? null
      return { row, song, primary }
    })).then(results => results.filter(Boolean) as NonNullable<typeof results[number]>[])
  }, [rows?.map(r => r.id).join(',')])

  const handlePlayAll = () => {
    if (!songData?.length) return
    const first = songData[0]
    if (!first.primary) return
    const cachedUrl = getCachedUrl(first.primary.localBlobId, first.primary.storagePath)
    if (cachedUrl) playAudioImmediately(cachedUrl, usePlayerStore.getState().playbackRate)
    else unlockAudioEl()
    void playSongVersion(first.song.columnSlug, first.song.id, first.primary.id)
  }

  const saveRename = async () => {
    if (nameDraft.trim()) await renamePlaylist(playlistId, nameDraft)
    setRenaming(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete playlist "${playlist?.name}"?`)) return
    await deletePlaylist(playlistId)
    onBack()
  }

  if (!playlist) return null

  return (
    <div className="playlist-detail">
      <div className="playlist-detail-header">
        <button type="button" className="playlist-back-btn" onClick={onBack}>‹ Playlists</button>
        <div className="playlist-detail-title-row">
          {renaming ? (
            <input
              className="playlist-rename-input"
              value={nameDraft}
              autoFocus
              onChange={e => setNameDraft(e.target.value)}
              onBlur={() => void saveRename()}
              onKeyDown={e => {
                if (e.key === 'Enter') void saveRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <h2 className="playlist-detail-name" onClick={() => { setNameDraft(playlist.name); setRenaming(true) }}>
              {playlist.name}
            </h2>
          )}
          <span className="playlist-detail-count">{songData?.length ?? 0} songs</span>
        </div>
        <div className="playlist-detail-actions">
          <button type="button" className="playlist-play-all-btn" onClick={handlePlayAll} disabled={!songData?.length}>
            ▶ Play all
          </button>
          <button type="button" className="playlist-delete-btn" onClick={() => void handleDelete()}>
            Delete
          </button>
        </div>
      </div>

      <div className="playlist-song-list">
        {songData?.map(({ row, song, primary }, idx) => {
          const isCurrent = currentSongId === song.id
          const isActive = isCurrent && isPlaying

          return (
            <div key={row.id} className={`playlist-song-row${isCurrent ? ' playlist-song-row--active' : ''}`}>
              <span className="playlist-song-num">{isActive ? '▶' : idx + 1}</span>

              <div className="playlist-song-info" onClick={() => openDrawer(song.id)}>
                <span className="playlist-song-title">{song.title}</span>
                {primary && (
                  <CachedWaveform
                    versionId={primary.id}
                    localBlobId={primary.localBlobId}
                    storagePath={primary.storagePath}
                    bars={60}
                    height={28}
                    progress={isCurrent ? usePlayerStore.getState().progress : 0}
                    active={isActive}
                    className="playlist-song-waveform"
                  />
                )}
              </div>

              <span className="playlist-song-dur">
                {primary ? formatDuration(primary.durationMs) : '—'}
              </span>

              <button
                type="button"
                className="playlist-song-play"
                onClick={() => {
                  if (isCurrent) { setPlaying(!isPlaying); return }
                  if (!primary) return
                  const url = getCachedUrl(primary.localBlobId, primary.storagePath)
                  if (url) playAudioImmediately(url, usePlayerStore.getState().playbackRate)
                  else unlockAudioEl()
                  void playSongVersion(song.columnSlug, song.id, primary.id)
                }}
              >
                {isActive ? '❚❚' : '▶'}
              </button>

              <button
                type="button"
                className="playlist-song-remove"
                title="Remove from playlist"
                onClick={() => void removeSongFromPlaylist(playlistId, song.id)}
              >
                ×
              </button>
            </div>
          )
        })}

        {songData?.length === 0 && (
          <p className="playlist-empty">No songs yet. Open a song and tap "Add to playlist"</p>
        )}
      </div>
    </div>
  )
}
