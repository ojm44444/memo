import { useEffect, useRef, useState } from 'react'
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
import { getPlaylists, getPlaylistSongs, removeSongFromPlaylist } from '@/db/repositories/playlistRepo'
import { listenViewAccentStyle, projectAccentTextStyle } from '@/lib/projectAccent'
import { FavouriteButton } from '@/components/song/FavouriteButton'
import { CachedWaveform } from '@/components/audio/CachedWaveform'
import { formatDuration } from '@/lib/audio-utils'
import { buildFavouritesPlaylist } from '@/lib/audio/buildFavouritesPlaylist'
import { playAudioImmediately, unlockAudioEl } from '@/lib/audio/globalAudioEl'
import { getCachedUrl } from '@/lib/audio/resolvePlaybackUrl'
import { playSongVersion } from '@/lib/playSongVersion'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/lib/cn'
import type { ColumnSlug } from '@/types/column'

type ListenScope = 'project' | 'library'
type ListenTab = 'favourites' | 'playlists'

export function ListenView() {
  const [tab, setTab] = useState<ListenTab>('favourites')
  const [scope, setScope] = useState<ListenScope>('project')
  const [shuffle, setShuffle] = useState(false)
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
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

  const filteredOut = !favourites?.length && (favouriteTotal ?? 0) > 0 && filtersActive

  return (
    <div className="listen-view">
      <NowPlayingBanner />

      {/* Tab bar */}
      <div className="listen-tab-bar">
        <button
          type="button"
          className={cn('listen-tab-btn', tab === 'favourites' && 'listen-tab-btn--active')}
          onClick={() => setTab('favourites')}
        >
          ★ Favourites
        </button>
        <button
          type="button"
          className={cn('listen-tab-btn', tab === 'playlists' && 'listen-tab-btn--active')}
          onClick={() => { setTab('playlists'); setActivePlaylistId(null) }}
        >
          ♫ Playlists
        </button>
        {tab === 'favourites' && (
          <ListenScopeToggle scope={scope} onChange={setScope} />
        )}
      </div>

      {tab === 'playlists' ? (
        activePlaylistId ? (
          <ListenPlaylistDetail
            playlistId={activePlaylistId}
            onBack={() => setActivePlaylistId(null)}
          />
        ) : (
          <ListenPlaylistList onOpen={setActivePlaylistId} />
        )
      ) : (
        <>
          <div
            className={cn('listen-view-header', showProjectAccent && 'has-project-accent')}
            style={headerAccentStyle}
          >
            <div>
              {favourites?.length ? (
                <>
                  <p className="listen-view-sub">{favourites.length} songs</p>
                  <p className="listen-view-kbd-hint">Tap title to open · tap section for board</p>
                </>
              ) : (
                <p className="listen-view-kbd-hint">
                  {filteredOut
                    ? `${favouriteTotal ?? 0} starred songs hidden by filters`
                    : 'Star songs on the board to build your listening queue'}
                </p>
              )}
            </div>
            {!!favourites?.length && (
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
            )}
          </div>

          {!favourites?.length ? (
            <div className="listen-view-empty">
              {filteredOut && (
                <button
                  type="button"
                  className="listen-view-clear-filters"
                  onClick={() => void clearAllBoardFilters()}
                >
                  Clear filters ({favouriteTotal ?? 0})
                </button>
              )}
              <p className="listen-view-empty-title">
                {filteredOut ? 'No favourites match your filters' : 'No favourites yet'}
              </p>
              <p className="listen-view-empty-sub">
                {filteredOut
                  ? 'Clear search or filters to see your starred songs.'
                  : 'Tap ★ on any song card to add it here.'}
              </p>
            </div>
          ) : (
            <ul className="listen-view-list">
              {favourites.map((song, index) => (
                <ListenRow
                  key={song.id}
                  index={index + 1}
                  songId={song.id}
                  title={song.title}
                  columnSlug={song.columnSlug}
                  projectName={scope === 'library' ? projectNameById.get(song.projectId ?? '') : undefined}
                  notes={song.notes}
                  isFavourite
                  isActive={currentSongId === song.id && isPlaying}
                  onPlay={() => void playSong(song.id)}
                  onOpen={() => openDrawer(song.id)}
                  onGoToColumn={song.projectId ? () => void goToColumn(song.projectId!, song.columnSlug) : undefined}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function ListenPlaylistList({ onOpen }: { onOpen: (id: string) => void }) {
  const playlists = useLiveQuery(() => getPlaylists(), [])
  const counts = useLiveQuery(async () => {
    if (!playlists) return {} as Record<string, number>
    const entries = await Promise.all(
      playlists.map(async (pl) => {
        const songs = await getPlaylistSongs(pl.id)
        return [pl.id, songs.length] as const
      })
    )
    return Object.fromEntries(entries) as Record<string, number>
  }, [playlists?.map((p) => p.id).join(',')])

  if (!playlists?.length) {
    return (
      <div className="listen-view-empty">
        <p className="listen-view-empty-title">No playlists yet</p>
        <p className="listen-view-empty-sub">Open any song and tap "+ Add to playlist" to create one.</p>
      </div>
    )
  }

  return (
    <div className="listen-playlist-list">
      {playlists.map((pl) => (
        <button key={pl.id} type="button" className="listen-playlist-row" onClick={() => onOpen(pl.id)}>
          <div className="listen-playlist-icon">♫</div>
          <div className="listen-playlist-info">
            <span className="listen-playlist-name">{pl.name}</span>
            <span className="listen-playlist-count">{counts?.[pl.id] ?? 0} songs</span>
          </div>
          <span className="listen-playlist-chevron">›</span>
        </button>
      ))}
    </div>
  )
}

function ListenPlaylistDetail({ playlistId, onBack }: { playlistId: string; onBack: () => void }) {
  const { currentSongId, isPlaying, setPlaying, progress } = usePlayerStore()
  const { openDrawer } = useUiStore()

  const rows = useLiveQuery(() => getPlaylistSongs(playlistId), [playlistId])
  const playlist = useLiveQuery(() => db.playlists.get(playlistId), [playlistId])

  const songData = useLiveQuery(async () => {
    if (!rows) return []
    const results = await Promise.all(rows.map(async (row) => {
      const song = await db.songs.get(row.songId)
      if (!song) return null
      const versions = await db.audioVersions.where('songId').equals(row.songId).sortBy('sortOrder')
      return { row, song, primary: versions[0] ?? null }
    }))
    return results.filter(Boolean) as NonNullable<(typeof results)[number]>[]
  }, [rows?.map((r) => r.id).join(',')])

  const handlePlay = (songId: string, columnSlug: string, versionId: string, url: string | null) => {
    if (currentSongId === songId) { setPlaying(!isPlaying); return }
    if (url) playAudioImmediately(url, usePlayerStore.getState().playbackRate)
    else unlockAudioEl()
    void playSongVersion(columnSlug as ColumnSlug, songId, versionId)
  }

  const handlePlayAll = () => {
    if (!songData?.length) return
    const first = songData[0]
    if (!first.primary) return
    const url = getCachedUrl(first.primary.localBlobId, first.primary.storagePath)
    handlePlay(first.song.id, first.song.columnSlug, first.primary.id, url)
  }

  return (
    <div className="listen-playlist-detail">
      <div className="listen-playlist-detail-header">
        <button type="button" className="listen-playlist-back" onClick={onBack}>‹ Playlists</button>
        <div className="listen-playlist-detail-title-row">
          <span className="listen-playlist-detail-name">{playlist?.name ?? '…'}</span>
          <span className="listen-playlist-detail-count">{songData?.length ?? 0} songs</span>
        </div>
        <button
          type="button"
          className="listen-playlist-play-all"
          disabled={!songData?.length}
          onClick={handlePlayAll}
        >
          ▶ Play all
        </button>
      </div>

      <ul className="listen-view-list">
        {songData?.map(({ row, song, primary }, idx) => {
          const isCurrent = currentSongId === song.id
          const isActive = isCurrent && isPlaying
          const url = primary ? getCachedUrl(primary.localBlobId, primary.storagePath) : null
          return (
            <li key={row.id} className={cn('listen-view-row', isActive && 'is-active')}>
              <span className="listen-view-index">{isActive ? '▶' : idx + 1}</span>
              <button
                type="button"
                className="listen-view-play"
                onClick={() => primary && handlePlay(song.id, song.columnSlug, primary.id, url)}
                aria-label={`Play ${song.title}`}
              >
                {isActive ? '❚❚' : '▶'}
              </button>
              <div className="listen-view-meta">
                <button
                  type="button"
                  className="listen-view-song-title"
                  onDoubleClick={() => openDrawer(song.id)}
                  onPointerUp={(e) => { if (e.pointerType === 'touch') openDrawer(song.id) }}
                >
                  {song.title}
                </button>
                {primary && (
                  <CachedWaveform
                    versionId={primary.id}
                    localBlobId={primary.localBlobId}
                    storagePath={primary.storagePath}
                    bars={60}
                    height={24}
                    progress={isCurrent ? (progress ?? 0) : 0}
                    active={isActive}
                    className="listen-row-waveform"
                  />
                )}
              </div>
              <span className="listen-view-duration">{formatDuration(primary?.durationMs)}</span>
              <button
                type="button"
                className="listen-row-remove"
                title="Remove from playlist"
                onClick={() => void removeSongFromPlaylist(playlistId, song.id)}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NowPlayingBanner() {
  const { currentSongId, currentVersionId, isPlaying, buffering, progress, setPlaying } = usePlayerStore()
  const { openDrawer } = useUiStore()

  const song = useLiveQuery(
    () => (currentSongId ? db.songs.get(currentSongId) : undefined),
    [currentSongId],
  )
  const version = useLiveQuery(
    () => (currentVersionId ? db.audioVersions.get(currentVersionId) : undefined),
    [currentVersionId],
  )

  if (!currentSongId || !song) return null

  return (
    <div className="listen-now-playing">
      <div className="listen-now-playing-inner">
        <div className="listen-now-playing-info" onClick={() => openDrawer(song.id)}>
          <span className="listen-now-playing-label">Now playing</span>
          <span className="listen-now-playing-title">{song.title}</span>
          {version && (
            <span className="listen-now-playing-version">{version.label}</span>
          )}
        </div>
        <div className="listen-now-playing-wave">
          {version && (
            <CachedWaveform
              versionId={version.id}
              localBlobId={version.localBlobId}
              storagePath={version.storagePath}
              bars={80}
              height={36}
              progress={progress ?? 0}
              active={isPlaying}
            />
          )}
        </div>
        <div className="listen-now-playing-controls">
          <span className="listen-now-playing-time">
            {formatDuration((progress ?? 0) * (version?.durationMs ?? 0))}
          </span>
          <button
            type="button"
            className={cn('listen-now-playing-play', buffering && 'listen-now-playing-play--buffering', isPlaying && !buffering && 'is-playing')}
            onClick={() => { if (!buffering) setPlaying(!isPlaying) }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {buffering ? <span className="player-bar-spinner" /> : isPlaying ? '❚❚' : '▶'}
          </button>
        </div>
      </div>
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
  onGoToColumn?: () => void
}) {
  const version = useLiveQuery(
    async () => {
      const versions = await db.audioVersions.where('songId').equals(songId).sortBy('sortOrder')
      return versions[0]
    },
    [songId],
  )
  const { progress } = usePlayerStore()

  return (
    <li className={cn('listen-view-row', isActive && 'is-active')}>
      <span className="listen-view-index">{isActive ? '▶' : index}</span>
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
        {version && (
          <CachedWaveform
            versionId={version.id}
            localBlobId={version.localBlobId}
            storagePath={version.storagePath}
            bars={60}
            height={22}
            progress={isActive ? (progress ?? 0) : 0}
            active={isActive}
            className="listen-row-waveform"
          />
        )}
        {notes.trim() && !version ? (
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
              onGoToColumn?.()
            }}
            aria-label={`Show ${columnSlug} on board`}
          >
            {columnSlug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())}
          </button>
        </span>
      </div>
      <span className="listen-view-duration">{formatDuration(version?.durationMs)}</span>
      <FavouriteButton songId={songId} isFavourite={isFavourite} className="listen-view-star" />
    </li>
  )
}
