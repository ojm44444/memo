import { useEffect, useState, type MouseEvent } from 'react'
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

/**
 * Collapsed by default, and it remembers.
 *
 * On a 790px window the board was getting 451px of it: titlebar, this strip,
 * the activity feed, a banner and the player bar all sit above or below the
 * columns, and this one was 72px that could never be put away. A Kanban
 * product whose Kanban is the smallest thing on screen has its priorities
 * backwards. The header line stays visible so it is still discoverable, which
 * is the difference between collapsing something and hiding it.
 *
 * Same key shape and the same default as BoardActivityFeed, so the two strips
 * behave identically rather than each having its own rule.
 */
const COLLAPSED_KEY = 'recent-collapsed'

export function RecentSongsRow({ scope = 'board' }: RecentSongsRowProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) !== 'false' } catch { return true }
  })

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  const songs = useLiveQuery(
    () => (scope === 'library' ? getRecentSongsAcrossLibrary(6) : getRecentSongs(6)),
    [scope],
  )
  const { currentSongId, isPlaying } = usePlayerStore()
  const openDrawer = useUiStore((s) => s.openDrawer)

  if (!songs?.length) return null

  return (
    <section
      className={collapsed ? 'recent-songs is-collapsed' : 'recent-songs'}
      aria-label="Recently updated songs"
    >
      <button
        type="button"
        className="recent-songs-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <h3 className="recent-songs-title">Recent</h3>
        <span className="recent-songs-hint">
          {scope === 'library' ? 'Last edited across your library' : 'Last edited on this board'}
        </span>
        <span className="recent-songs-toggle" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
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
      )}
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
