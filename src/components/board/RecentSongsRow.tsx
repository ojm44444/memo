import type { MouseEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ColumnSlug } from '@/types/column'
import { db } from '@/db/database'
import { getRecentSongs, getRecentSongsAcrossLibrary } from '@/db/repositories/boardRepo'
import { formatDuration } from '@/lib/audio-utils'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'

interface RecentSongsRowProps {
  scope?: 'board' | 'library'
}

export function RecentSongsRow({ scope = 'board' }: RecentSongsRowProps) {
  const songs = useLiveQuery(
    () => (scope === 'library' ? getRecentSongsAcrossLibrary(6) : getRecentSongs(6)),
    [scope],
  )
  const { currentSongId, isPlaying } = usePlayerStore()
  const openDrawer = useUiStore((s) => s.openDrawer)

  if (!songs?.length) return null

  return (
    <section className="recent-songs" aria-label="Recently updated songs">
      <div className="recent-songs-header">
        <h3 className="recent-songs-title">Recent</h3>
        <span className="recent-songs-hint">
          {scope === 'library' ? 'Last edited across your library' : 'Last edited on this board'}
        </span>
      </div>
      <div className="recent-songs-track">
        {songs.map((song) => (
          <RecentSongChip
            key={song.id}
            song={song}
            isActive={currentSongId === song.id && isPlaying}
            onOpen={() => openDrawer(song.id)}
          />
        ))}
      </div>
    </section>
  )
}

function RecentSongChip({
  song,
  isActive,
  onOpen,
}: {
  song: { id: string; title: string; columnSlug: string }
  isActive: boolean
  onOpen: () => void
}) {
  const version = useLiveQuery(
    () => db.audioVersions.where('songId').equals(song.id).sortBy('sortOrder').then((v) => v[0]),
    [song.id],
  )

  const play = async (event: MouseEvent) => {
    event.stopPropagation()
    if (!version) return
    await usePlayerStore
      .getState()
      .playAtVersion(song.columnSlug as ColumnSlug, song.id, version.id)
  }

  return (
    <div className="recent-song-chip">
      <button type="button" className="recent-song-chip-main" onClick={onOpen}>
        <span className="recent-song-chip-title">{song.title}</span>
        {version && (
          <span className="recent-song-chip-meta">{formatDuration(version.durationMs)}</span>
        )}
      </button>
      {version && (
        <button
          type="button"
          className={isActive ? 'recent-song-chip-play is-active' : 'recent-song-chip-play'}
          aria-label={`Play ${song.title}`}
          onClick={(e) => void play(e)}
        >
          {isActive ? '❚❚' : '▶'}
        </button>
      )}
    </div>
  )
}
