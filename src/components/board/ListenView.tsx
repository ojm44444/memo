import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  getAllFavouriteSongs,
  getFavouriteSongs,
  getSong,
} from '@/db/repositories/boardRepo'
import {
  clearAllBoardFilters,
  getActiveProjectId,
  getProjectAccentHue,
  getProjects,
  hasActiveBoardFilters,
  setActiveProjectId,
} from '@/db/repositories/projectRepo'
import { listenViewAccentStyle, projectAccentTextStyle } from '@/lib/projectAccent'
import { FavouriteButton } from '@/components/song/FavouriteButton'
import { formatDuration } from '@/lib/audio-utils'
import { buildFavouritesPlaylist } from '@/lib/audio/buildFavouritesPlaylist'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/lib/cn'
import type { ColumnSlug } from '@/types/column'
type ListenScope = 'project' | 'library'

export function ListenView() {
  const [scope, setScope] = useState<ListenScope>('project')
  const [shuffle, setShuffle] = useState(false)
  const favourites = useLiveQuery(
    () => (scope === 'library' ? getAllFavouriteSongs() : getFavouriteSongs()),
    [scope],
  )
  const projects = useLiveQuery(() => getProjects(), [])
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )
  const showProjectAccent = scope === 'project' && !!activeProjectId
  const headerAccentStyle = showProjectAccent
    ? listenViewAccentStyle(activeProjectId!, accentHue ?? null)
    : undefined
  const titleAccentStyle = showProjectAccent
    ? projectAccentTextStyle(activeProjectId!, accentHue ?? null)
    : undefined
  const favouriteTotal = useLiveQuery(async () => {
    if (scope === 'library') {
      return db.songs.filter((song) => !song.deletedAt && song.isFavourite).count()
    }
    const projectId = await getActiveProjectId()
    return db.songs
      .filter((song) => !song.deletedAt && song.isFavourite && song.projectId === projectId)
      .count()
  }, [scope])
  const filtersActive = useLiveQuery(() => hasActiveBoardFilters(), [])
  const { currentSongId, isPlaying, playlistSource } = usePlayerStore()
  const { openDrawer, requestColumnScroll, setBoardMode } = useUiStore()

  const goToColumn = async (projectId: string, columnSlug: ColumnSlug) => {
    if (scope === 'library') {
      await setActiveProjectId(projectId)
    }
    setBoardMode('manage')
    requestColumnScroll(columnSlug)
  }

  useEffect(() => {
    if (!currentSongId || !isPlaying || playlistSource !== 'favourites') return
    void (async () => {
      const song = await getSong(currentSongId)
      if (!song) return
      requestColumnScroll(song.columnSlug)
    })()
  }, [currentSongId, isPlaying, playlistSource, requestColumnScroll])

  const projectNameById = new Map(projects?.map((project) => [project.id, project.name]))

  const playSong = async (songId: string) => {
    const versions = await db.audioVersions.where('songId').equals(songId).sortBy('sortOrder')
    const version = versions[0]
    if (!version) return

    const playlist = await buildFavouritesPlaylist(scope, { shuffle })
    const index = playlist.findIndex((item) => item.songId === songId)
    if (index < 0) return

    await usePlayerStore.getState().playFavourites(scope, index, version.id, shuffle)
  }

  const playAll = async () => {
    await usePlayerStore.getState().playFavourites(scope, 0, undefined, shuffle)
  }

  if (!favourites?.length) {
    const filteredOut = (favouriteTotal ?? 0) > 0 && filtersActive
    return (
      <div className="listen-view">
        <div
          className={cn('listen-view-header', showProjectAccent && 'has-project-accent')}
          style={headerAccentStyle}
        >
          <div>
            <ListenScopeToggle scope={scope} onChange={setScope} />
            <h2 className="listen-view-title" style={titleAccentStyle}>
              ★ Favourites
            </h2>
            <p className="listen-view-kbd-hint">
              {filteredOut
                ? `${favouriteTotal ?? 0} starred songs hidden by filters · clear filters to listen`
                : 'Tap title to open · tap section for board'}
            </p>
          </div>
        </div>
        <div className="listen-view-empty" role={filteredOut ? 'status' : undefined}>
          {filteredOut && (
            <p className="sr-only" aria-atomic="true">
              {(favouriteTotal ?? 0)} starred {(favouriteTotal ?? 0) === 1 ? 'song' : 'songs'} hidden
              by filters. Clear filters to listen.
            </p>
          )}
          <p className="listen-view-empty-title">
            {filteredOut ? 'No favourites match your filters' : 'No favourites yet'}
          </p>
          {filteredOut && (
            <p className="listen-view-empty-count" aria-hidden="true">
              {favouriteTotal ?? 0} starred {(favouriteTotal ?? 0) === 1 ? 'song' : 'songs'} hidden
            </p>
          )}
          <p className="listen-view-empty-sub">
            {filteredOut
              ? 'Clear search or filters to see your starred songs again.'
              : 'Star songs on the board, then come back here to skim your keepers.'}
          </p>
          {filteredOut && (
            <button
              type="button"
              className="listen-view-clear-filters"
              onClick={() => void clearAllBoardFilters()}
              aria-label={`Clear filters and show ${favouriteTotal ?? 0} starred ${
                (favouriteTotal ?? 0) === 1 ? 'song' : 'songs'
              }`}
            >
              Clear filters ({favouriteTotal ?? 0})
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="listen-view">
      <div
        className={cn('listen-view-header', showProjectAccent && 'has-project-accent')}
        style={headerAccentStyle}
      >
        <div>
          <ListenScopeToggle scope={scope} onChange={setScope} />
          <h2 className="listen-view-title" style={titleAccentStyle}>
            ★ Favourites
          </h2>
          <p className="listen-view-sub">{favourites.length} songs</p>
          <p className="listen-view-kbd-hint">Tap title to open · tap section for board</p>
        </div>
        <div className="listen-view-actions">
          <button
            type="button"
            className={shuffle ? 'listen-view-shuffle is-active' : 'listen-view-shuffle'}
            onClick={() => setShuffle((value) => !value)}
            aria-pressed={shuffle}
          >
            Shuffle
          </button>
          <button type="button" className="listen-view-play-all" onClick={() => void playAll()}>
            Play all
          </button>
        </div>
      </div>

      <ul className="listen-view-list">
        {favourites.map((song, index) => (
          <ListenRow
            key={song.id}
            index={index + 1}
            songId={song.id}
            title={song.title}
            columnSlug={song.columnSlug}
            projectName={scope === 'library' ? projectNameById.get(song.projectId) : undefined}
            notes={song.notes}
            isFavourite
            isActive={currentSongId === song.id && isPlaying}
            onPlay={() => void playSong(song.id)}
            onOpen={() => openDrawer(song.id)}
            onGoToColumn={() => void goToColumn(song.projectId, song.columnSlug)}
          />
        ))}
      </ul>
    </div>
  )
}

function ListenScopeToggle({
  scope,
  onChange,
}: {
  scope: ListenScope
  onChange: (scope: ListenScope) => void
}) {
  return (
    <div className="listen-scope-toggle">
      <button
        type="button"
        className={scope === 'project' ? 'is-active' : undefined}
        onClick={() => onChange('project')}
      >
        This project
      </button>
      <button
        type="button"
        className={scope === 'library' ? 'is-active' : undefined}
        onClick={() => onChange('library')}
      >
        All projects
      </button>
    </div>
  )
}

function ListenRow({
  index,
  songId,
  title,
  columnSlug,
  projectName,
  notes,
  isFavourite,
  isActive,
  onPlay,
  onOpen,
  onGoToColumn,
}: {
  index: number
  songId: string
  title: string
  columnSlug: string
  projectName?: string
  notes: string
  isFavourite: boolean
  isActive: boolean
  onPlay: () => void
  onOpen: () => void
  onGoToColumn: () => void
}) {
  const version = useLiveQuery(
    async () => {
      const versions = await db.audioVersions.where('songId').equals(songId).sortBy('sortOrder')
      return versions[0]
    },
    [songId],
  )

  return (
    <li className={cn('listen-view-row', isActive && 'is-active')}>
      <span className="listen-view-index">{index}</span>
      <button type="button" className="listen-view-play" onClick={onPlay} aria-label={`Play ${title}`}>
        {isActive ? '❚❚' : '▶'}
      </button>
      <div className="listen-view-meta">
        <button
          type="button"
          className="listen-view-song-title"
          onDoubleClick={onOpen}
          onPointerUp={(e) => { if (e.pointerType === 'touch') onOpen() }}
          aria-label={`${title}. Double-click or tap to open song details`}
        >
          {title}
        </button>
        {notes.trim() ? (
          <button type="button" className="listen-view-song-notes" onClick={onOpen}>
            {notes.trim()}
          </button>
        ) : null}
        <span className="listen-view-song-col">
          {projectName && (
            <>
              <span className="listen-view-song-project">{projectName}</span>
              <span aria-hidden="true"> · </span>
            </>
          )}
          <button
            type="button"
            className="listen-view-column-link"
            onClick={(event) => {
              event.stopPropagation()
              onGoToColumn()
            }}
            aria-label={`Show ${columnSlug} on board`}
          >
            {columnSlug}
          </button>
        </span>
      </div>
      <span className="listen-view-duration">{formatDuration(version?.durationMs)}</span>
      <FavouriteButton songId={songId} isFavourite={isFavourite} className="listen-view-star" />
    </li>
  )
}
