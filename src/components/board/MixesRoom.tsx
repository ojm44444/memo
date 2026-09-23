import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { AudioVersion } from '@/types/audio-version'
import type { Song } from '@/types/song'
import { db } from '@/db/database'
import { getSongsWithMixes, setAudioVersionKind } from '@/db/repositories/audioRepo'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDuration } from '@/lib/audio-utils'
import { getMyDisplayName } from '@/lib/displayName'
import { scheduleFlush } from '@/sync/syncEngine'
import {
  getListenProject,
  getListenProjects,
  listenCoverUrl,
  moveSongsToListenProject,
  deleteListenProject,
  duplicateListenProject,
  reorderListenProject,
  updateListenProject,
} from '@/db/repositories/listenProjectRepo'
import type { ListenProject } from '@/types/listen-project'
import { SongComments } from '@/components/song/SongComments'
import { RecordArt, RecordMenu } from '@/components/share/RecordParts'
import { mergeSongsInto, updateSong } from '@/db/repositories/boardRepo'
import { deleteSongForever } from '@/db/repositories/trashRepo'
import { LISTEN_SLUG } from '@/types/column'
import {
  CheckIcon,
  DownloadIcon,
  ChevronRightIcon,
  CommentIcon,
  EqIcon,
  LinkIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShuffleIcon,
  StackIcon,
} from '@/components/ui/Icons'
import { MixImport } from './MixImport'
import { addVersionFiles } from '@/lib/listenImport'
import { renderGeneratedCover } from '@/lib/generatedCover'
import { createCollectionShare, uploadCollectionCover } from '@/db/repositories/collectionShareRepo'
import { useUploadProgress } from '@/sync/uploadProgress'
import { cacheRemoteAudioVersion } from '@/sync/audioDownload'
import { requestStoragePersistence } from '@/lib/storagePersistence'
import { ProjectSheet } from './ProjectSheet'
import { ShareCollectionSheet } from './ShareCollectionSheet'
import { getCachedUrl, presignPlaybackUrls } from '@/lib/audio/resolvePlaybackUrl'
import { playAudioImmediately } from '@/lib/audio/globalAudioEl'
import { loadingLabel, useLoadProgress } from '@/stores/loadProgressStore'
import '@/styles/record.css'
import '@/styles/listeners.css'
import '@/styles/playback-progress.css'

/**
 * Listen: demos, mixes and masters, and where they go out from.
 *
 * Rebuilt 16 Sept to the standard Owen set by pointing at Samply: a cover, a
 * title, Play and Shuffle, and a quiet tracklist with notes, versions and
 * length on the right. Samply is only this half of the job. songdrafts has
 * the board behind it, so this room has to be at least as good at the half
 * Samply does.
 *
 * A row is a STACK: the top version plays, the stack button picks another,
 * and swapping while it plays keeps your place so you can A/B the same bar.
 */

type Stack = { song: Song; latest: AudioVersion; mixCount: number; versions: AudioVersion[] }

function whenReceived(iso: string | null | undefined) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function StackRow({
  stack,
  index,
  chosenId,
  onChoose,
  notesOpen,
  onToggleNotes,
  projectId,
  projects,
  onMoveBy,
  onPlay,
  selected,
  selecting,
  onToggleSelect,
}: {
  stack: Stack
  index: number
  chosenId: string | null
  onChoose: (versionId: string) => void
  notesOpen: boolean
  onToggleNotes: () => void
  projectId: string | null
  projects: ListenProject[]
  onMoveBy?: (by: -1 | 1) => void
  onPlay: (versionId: string, seekMs?: number) => void
  selected: boolean
  selecting: boolean
  onToggleSelect: () => void
}) {
  const { song, versions } = stack
  const isCurrent = usePlayerStore((s) => s.currentSongId === song.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const chosen = versions.find((v) => v.id === chosenId) ?? stack.latest
  const playing = isCurrent && isPlaying
  // Set only while this row's take is still arriving from the cloud.
  const loadingId = useLoadProgress((s) => s.versionId)
  const loadFraction = useLoadProgress((s) => s.fraction)
  const loading = isCurrent && loadingId != null && versions.some((v) => v.id === loadingId)
  const onBoard = song.columnSlug !== LISTEN_SLUG
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(song.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const versionInput = useRef<HTMLInputElement>(null)
  const noteCount = useLiveQuery(
    () => db.songComments.where('songId').equals(song.id).filter((c) => !c.deletedAt).count(),
    [song.id],
  )

  const chooseAndPlay = (version: AudioVersion) => {
    onChoose(version.id)
    const player = usePlayerStore.getState()
    const currentMs = player.currentSongId === song.id ? player.progress * (chosen.durationMs || 0) : 0
    const clamped = Math.min(currentMs, Math.max(0, (version.durationMs || 0) - 250))
    onPlay(version.id, clamped > 0 ? clamped : undefined)
  }

  const togglePlay = () => {
    if (renaming) return
    if (selecting) {
      onToggleSelect()
      return
    }
    const player = usePlayerStore.getState()
    if (isCurrent) {
      player.setPlaying(!player.isPlaying)
      return
    }
    onPlay(chosen.id)
  }

  const saveName = () => {
    setRenaming(false)
    const title = name.trim()
    if (title && title !== song.title) void updateSong(song.id, { title }).then(() => scheduleFlush())
    else setName(song.title)
  }

  const cloud = chosen.storagePath ? null : chosen.uploadBlockedReason ? 'blocked' : 'uploading'
  const upload = useUploadProgress(cloud === 'uploading' ? chosen.id : null)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const item = (label: React.ReactNode, onClick: () => void, className = '') => (
    <button type="button" role="menuitem" className={`rec-menu-item ${className}`} onClick={onClick}>
      <span />
      <span>{label}</span>
      <span />
    </button>
  )

  return (
    <li className={`rec-row${isCurrent ? ' is-current' : ''}${selected ? ' is-selected' : ''}${selecting ? ' is-selecting' : ''}`}>
      <input
        ref={versionInput}
        type="file"
        accept="audio/*,.wav,.aif,.aiff,.flac,.zip,application/zip"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) void addVersionFiles(song.id, files)
        }}
      />
      <div
        className="rec-line"
        role="button"
        tabIndex={0}
        aria-label={`${playing ? 'Pause' : 'Play'} ${song.title}`}
        onClick={togglePlay}
        onKeyDown={(e) => {
          if (renaming) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            togglePlay()
          }
        }}
      >
        <span className="rec-num">
          <button
            type="button"
            className={`rec-check${selected ? ' is-on' : ''}`}
            aria-pressed={selected}
            aria-label={`Select ${song.title}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
          >
            {selected ? <CheckIcon size={14} /> : null}
          </button>
          <span className="rec-num-face">
            {loading ? (
              <span className="pp-spinner" aria-hidden />
            ) : isCurrent ? (
              <EqIcon className={playing ? undefined : 'is-paused'} />
            ) : (
              <>
                <span className="rec-num-index">{index}</span>
                <span className="rec-num-play">
                  <PlayIcon size={14} />
                </span>
              </>
            )}
          </span>
        </span>

        <span className="rec-name">
          {renaming ? (
            <input
              className="rec-rename"
              value={name}
              autoFocus
              onClick={stop}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') {
                  setName(song.title)
                  setRenaming(false)
                }
              }}
              aria-label="Track name"
            />
          ) : (
            <span className="rec-name-title">{song.title}</span>
          )}
          {loading && (
            <span className="pp-row-status" role="status">
              {loadingLabel(loadFraction)}
            </span>
          )}
          {cloud === 'uploading' && (
            <span className={`rec-name-warn${upload?.failed ? ' is-bad' : ''}`} title={upload?.failed ?? undefined}>
              {upload?.failed
                ? 'Upload failed, retrying'
                : upload
                  ? `Uploading ${Math.round(upload.fraction * 100)}%`
                  : 'Waiting to upload'}
            </span>
          )}
          {cloud === 'blocked' && <span className="rec-name-warn is-bad">Too big for the cloud</span>}
        </span>

        <span className="rec-right" onClick={stop} onKeyDown={stop}>
          <button
            type="button"
            className={`rec-stat${noteCount ? '' : ' is-empty'}`}
            aria-expanded={notesOpen}
            aria-label={`Notes on ${song.title}`}
            onClick={onToggleNotes}
          >
            <CommentIcon size={17} />
            {noteCount ? <span>{noteCount}</span> : null}
          </button>

          <RecordMenu
            label={`Versions of ${song.title}`}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="rec-stat rec-versions-btn"
                aria-expanded={open}
                aria-label={`${versions.length} versions of ${song.title}`}
                onClick={toggle}
              >
                <StackIcon size={17} />
                <span>v{versions.length - versions.findIndex((v) => v.id === chosen.id)}</span>
              </button>
            )}
          >
            {(close) => (
              <>
                <p className="rec-menu-title">Versions</p>
                {versions.map((version, i) => (
                  <button
                    key={version.id}
                    type="button"
                    role="menuitem"
                    className={`rec-menu-item rec-version${version.id === chosen.id ? ' is-on' : ''}`}
                    onClick={() => {
                      close()
                      chooseAndPlay(version)
                    }}
                  >
                    <span className="rec-version-num">v{versions.length - i}</span>
                    <span>
                      {version.label || 'Untitled'}
                      <small>{whenReceived(version.createdAt)}</small>
                    </span>
                    <span className="rec-menu-meta">{formatDuration(version.durationMs)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="rec-menu-item rec-version-add"
                  onClick={() => {
                    close()
                    versionInput.current?.click()
                  }}
                >
                  <span>
                    <PlusIcon size={15} />
                  </span>
                  <span>Add version</span>
                  <span />
                </button>
              </>
            )}
          </RecordMenu>

          <span className="rec-dur">{formatDuration(chosen.durationMs)}</span>

          <RecordMenu
            label={`More for ${song.title}`}
            trigger={({ open, toggle }) => (
              <button type="button" className="rec-more" aria-expanded={open} aria-label="More" onClick={toggle}>
                <MoreIcon size={18} />
              </button>
            )}
          >
            {(close) => (
              <>
                {item('Add version', () => {
                  close()
                  versionInput.current?.click()
                })}
                {item('Rename', () => {
                  close()
                  setName(song.title)
                  setRenaming(true)
                })}
                {projectId && onMoveBy && item('Move up', () => {
                  close()
                  onMoveBy(-1)
                })}
                {projectId && onMoveBy && item('Move down', () => {
                  close()
                  onMoveBy(1)
                })}
                {projects
                  .filter((p) => p.id !== projectId)
                  .map((p) => (
                    <span key={p.id}>
                      {item(`Move to ${p.title}`, () => {
                        close()
                        void moveSongsToListenProject([song.id], p.id).then(() => scheduleFlush())
                      })}
                    </span>
                  ))}
                {projectId && item('Take out of this playlist', () => {
                  close()
                  void moveSongsToListenProject([song.id], null).then(() => scheduleFlush())
                })}
                {onBoard && item('Open on the board', () => {
                  close()
                  useUiStore.getState().openDrawer(song.id)
                })}
                {onBoard
                  ? item(
                      <>
                        Remove from Listen
                        <small>It stays on your board.</small>
                      </>,
                      () => {
                        close()
                        void Promise.all(versions.map((v) => setAudioVersionKind(v.id, 'take'))).then(() => scheduleFlush())
                      },
                      'is-danger',
                    )
                  : confirmDelete
                    ? item('Tap again: delete forever', () => {
                        close()
                        void deleteSongForever(song.id).then(() => scheduleFlush())
                      }, 'is-danger')
                    : (
                      <button
                        type="button"
                        role="menuitem"
                        className="rec-menu-item is-danger"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <span />
                        <span>Delete</span>
                        <span />
                      </button>
                    )}
              </>
            )}
          </RecordMenu>
        </span>
      </div>

      {notesOpen && (
        <div className="rec-panel">
          <SongComments songId={song.id} />
        </div>
      )}
    </li>
  )
}

export function MixesRoom({
  projectId,
  onBack,
  onOpen,
}: {
  projectId: string | null
  onBack: () => void
  /** Jump straight into another playlist, e.g. the copy just made. */
  onOpen?: (id: string) => void
}) {
  const mixes = useLiveQuery(() => getSongsWithMixes(), [])
  const projects = useLiveQuery(() => getListenProjects(), [])
  const project = useLiveQuery(
    () => (projectId ? getListenProject(projectId).then((p) => p ?? null) : Promise.resolve(null)),
    [projectId],
  )
  const [pickedVersion, setPickedVersion] = useState<Record<string, string>>({})
  const [notesRow, setNotesRow] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [quick, setQuick] = useState<{ busy: boolean; url: string | null; copied: boolean; error: string | null } | null>(null)
  const [editing, setEditing] = useState(false)
  const [artist, setArtist] = useState('')
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [duplicating, setDuplicating] = useState(false)

  useEffect(() => {
    let live = true
    void getMyDisplayName().then((name) => live && setArtist(name === 'You' ? '' : name))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    void listenCoverUrl(project?.coverPath).then((url) => live && setCoverUrl(url))
    return () => {
      live = false
    }
  }, [project?.coverPath])

  // A project deleted elsewhere (another device, or the sheet) goes back to Projects.
  useEffect(() => {
    if (projectId && project === null) onBack()
  }, [projectId, project, onBack])

  const ordered = useMemo(() => {
    if (!mixes) return []
    const here = mixes.filter((s) => (s.song.listenProjectId ?? null) === projectId)
    if (projectId) {
      return here.sort(
        (a, b) =>
          (a.song.listenPosition ?? Number.MAX_SAFE_INTEGER) - (b.song.listenPosition ?? Number.MAX_SAFE_INTEGER),
      )
    }
    const rank = (s: Stack) => (s.latest.kind === 'master' ? 0 : s.latest.kind === 'mix' ? 1 : 2)
    return here.sort((a, b) => rank(a) - rank(b))
  }, [mixes, projectId])

  const loose = useMemo(() => (mixes ?? []).filter((s) => !s.song.listenProjectId), [mixes])

  // Sign this playlist's cloud takes up front so a tap starts streaming at once.
  const cloudPaths = useMemo(
    () =>
      ordered
        .flatMap((s) => s.versions)
        .filter((v) => !v.localBlobId && v.storagePath)
        .map((v) => v.storagePath)
        .join('\n'),
    [ordered],
  )
  useEffect(() => {
    if (cloudPaths) void presignPlaybackUrls(cloudPaths.split('\n'))
  }, [cloudPaths])

  if (mixes === undefined || projects === undefined || (projectId && project === undefined)) return null

  const totalMs = ordered.reduce((sum, s) => {
    const chosen = s.versions.find((v) => v.id === pickedVersion[s.song.id]) ?? s.latest
    return sum + (chosen.durationMs || 0)
  }, 0)
  const uploading = ordered.flatMap((s) => s.versions).filter((v) => !v.storagePath && !v.uploadBlockedReason).length
  const title = project?.title ?? 'Not in a playlist'
  const byLine = project ? project.artist || artist : 'Tracks not in a playlist yet'

  /* A cloud take whose URL is already signed starts inside the tap, so the
     stream begins at once instead of after the player's own async load. Only
     for cloud takes: a take on this device is ready in milliseconds anyway,
     and a seek (swapping versions mid-song) needs the player's own load. */
  const startCloudTakeNow = (versionId: string, seekMs?: number) => {
    if (seekMs) return
    const version = ordered.flatMap((s) => s.versions).find((v) => v.id === versionId)
    if (!version || version.localBlobId || !version.storagePath) return
    const url = getCachedUrl(null, version.storagePath)
    if (url) playAudioImmediately(url, usePlayerStore.getState().playbackRate)
  }

  // Listen plays only this playlist, never the board (playerStore.playListen).
  const playAll = (shuffle: boolean) => {
    if (!ordered.length) return
    const items = ordered.map((s) => {
      const chosen = s.versions.find((v) => v.id === pickedVersion[s.song.id]) ?? s.latest
      return { songId: s.song.id, audioVersionId: chosen.id, songTitle: s.song.title }
    })
    if (shuffle) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
    }
    startCloudTakeNow(items[0].audioVersionId)
    usePlayerStore.getState().playListen(items, 0)
  }

  const playFrom = (songId: string, versionId: string, seekMs?: number) => {
    const items = ordered.map((s) => {
      const v = s.song.id === songId ? versionId : (s.versions.find((x) => x.id === pickedVersion[s.song.id]) ?? s.latest).id
      return { songId: s.song.id, audioVersionId: v, songTitle: s.song.title }
    })
    const index = Math.max(0, items.findIndex((i) => i.songId === songId))
    startCloudTakeNow(versionId, seekMs)
    usePlayerStore.getState().playListen(items, index, versionId, seekMs ?? null)
  }

  const joinSelected = async () => {
    const inOrder = ordered.map((s) => s.song.id).filter((id) => selected.includes(id))
    if (inOrder.length < 2) return
    await mergeSongsInto(inOrder[0], inOrder.slice(1))
    setSelected([])
    scheduleFlush()
  }

  /* One tap (17 Sept, Owen): Share makes the link straight away with the
     plain defaults, copies it, and offers Settings for the extras. The link
     wears the playlist's own cover: a generated one is saved as an image the
     first time, so the page a listener opens looks exactly like this one. */
  const variant = project ? projects.findIndex((p) => p.id === project.id) : undefined
  const quickShare = async () => {
    if (!ordered.length) return
    setQuick({ busy: true, url: null, copied: false, error: null })
    try {
      let coverPath = project?.coverPath ?? null
      if (project && !coverPath) {
        try {
          const file = await renderGeneratedCover(project.id, variant)
          coverPath = await uploadCollectionCover(file)
          await updateListenProject(project.id, { coverPath })
          scheduleFlush()
        } catch {
          coverPath = null
        }
      }
      const items = ordered.map((s) => ({
        songId: s.song.id,
        versionId: (s.versions.find((v) => v.id === pickedVersion[s.song.id]) ?? s.latest).id,
      }))
      const url = await createCollectionShare(items, {
        title: project?.title ?? 'Tracks',
        artist: project?.artist || artist,
        allowDownload: false,
        expiresInDays: 30,
        coverPath,
      })
      let copied = false
      try {
        await navigator.clipboard.writeText(url)
        copied = true
      } catch {
        /* shown to copy by hand */
      }
      setQuick({ busy: false, url, copied, error: null })
    } catch (err) {
      setQuick({ busy: false, url: null, copied: false, error: err instanceof Error ? err.message : 'Could not make the link.' })
    }
  }

  const moveBy = (songId: string, by: -1 | 1) => {
    const ids = ordered.map((s) => s.song.id)
    const from = ids.indexOf(songId)
    const to = from + by
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    void reorderListenProject(ids).then(() => scheduleFlush())
  }

  return (
    <div className="rec">
      <button type="button" className="rec-back" onClick={onBack}>
        <ChevronRightIcon size={16} className="rec-back-icon" />
        Playlists
      </button>

      <section className="rec-hero">
        <RecordArt seed={project?.id ?? 'loose'} label={title} src={coverUrl} variant={project ? (projects.findIndex((p) => p.id === project.id)) : undefined} />
        <div>
          <p className="rec-eyebrow">
            {ordered.length} {ordered.length === 1 ? 'track' : 'tracks'}
            {totalMs ? ` · ${formatDuration(totalMs)}` : ''}
          </p>
          <h2 className="rec-title">{title}</h2>
          {byLine && <p className="rec-artist">{byLine}</p>}

          <div className="rec-actions">
            <PlayAllButton
              disabled={!ordered.length}
              onPlay={() => playAll(false)}
              songIds={ordered.map((s) => s.song.id)}
            />
            <button type="button" className="rec-pill is-quiet" disabled={ordered.length < 2} onClick={() => playAll(true)}>
              <ShuffleIcon size={17} />
              Shuffle
            </button>
            <OfflineButton versions={ordered.flatMap((st) => st.versions)} />
            <div className="rec-actions-end">
              {project && (
                <RecordMenu
                  label={`More for ${project.title}`}
                  trigger={({ open, toggle }) => (
                    <button type="button" className="rec-circle" aria-expanded={open} aria-label="Playlist options" onClick={toggle}>
                      <MoreIcon size={20} />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <button type="button" role="menuitem" className="rec-menu-item" onClick={() => { close(); setEditing(true) }}>
                        <span />
                        <span>Edit title, artist and cover</span>
                        <span />
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="rec-menu-item"
                        disabled={duplicating}
                        onClick={() => {
                          close()
                          const count = ordered.length
                          if (
                            count > 0 &&
                            !window.confirm(
                              `Duplicate "${project.title}" with ${count} ${count === 1 ? 'track' : 'tracks'}?`,
                            )
                          ) {
                            return
                          }
                          setDuplicating(true)
                          void duplicateListenProject(project.id)
                            .then((result) => {
                              scheduleFlush()
                              if (result.clipsSkipped > 0) {
                                alert(
                                  `Made "${result.project.title}" with ${result.songsCopied} tracks. ${result.clipsSkipped} cloud-only takes were skipped. Download them first from Settings.`,
                                )
                              }
                              onOpen?.(result.project.id)
                            })
                            .catch((err) => {
                              alert(err instanceof Error ? err.message : 'Could not duplicate this playlist')
                            })
                            .finally(() => setDuplicating(false))
                        }}
                      >
                        <span />
                        <span>{duplicating ? 'Duplicating…' : 'Duplicate playlist'}</span>
                        <span />
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="rec-menu-item is-danger"
                        onClick={() => {
                          close()
                          if (!window.confirm(`Delete the playlist "${project.title}"? The songs stay in Listen.`)) return
                          void deleteListenProject(project.id).then(() => {
                            scheduleFlush()
                            onBack()
                          })
                        }}
                      >
                        <span />
                        <span>Delete playlist</span>
                        <span />
                      </button>
                      {loose.length > 0 && <p className="rec-menu-title">Add from Not in a playlist</p>}
                      {loose.map((s) => (
                        <button
                          key={s.song.id}
                          type="button"
                          role="menuitem"
                          className="rec-menu-item"
                          onClick={() => {
                            close()
                            void moveSongsToListenProject([s.song.id], project.id).then(() => scheduleFlush())
                          }}
                        >
                          <span><PlusIcon size={15} /></span>
                          <span>{s.song.title}</span>
                          <span className="rec-menu-meta">{formatDuration(s.latest.durationMs)}</span>
                        </button>
                      ))}
                    </>
                  )}
                </RecordMenu>
              )}
              <MixImport variant="circle" projectId={projectId} />
              <button
                type="button"
                className="rec-pill is-accent"
                disabled={!ordered.length}
                onClick={() => void quickShare()}
              >
                Share
                <LinkIcon size={17} />
              </button>
            </div>
          </div>
          {needsOffline(ordered.flatMap((st) => st.versions)) && (
            <p className="listeners-offline-note">Tap Make offline so every track plays without signal.</p>
          )}
        </div>
      </section>

      {uploading > 0 && (
        <p className="rec-status">
          <span className="rec-status-dot" aria-hidden />
          {uploading} {uploading === 1 ? 'file is' : 'files are'} uploading. Keep songdrafts open until
          {uploading === 1 ? ' it finishes' : ' they finish'}. You can share the link already.
        </p>
      )}

      {ordered.length === 0 ? (
        <MixImport variant="empty" projectId={projectId} acceptDrops={false} />
      ) : (
        <ol className="rec-list">
          {ordered.map((stack, i) => (
            <StackRow
              key={stack.song.id}
              stack={stack}
              index={i + 1}
              chosenId={pickedVersion[stack.song.id] ?? null}
              onChoose={(versionId) => setPickedVersion((prev) => ({ ...prev, [stack.song.id]: versionId }))}
              notesOpen={notesRow === stack.song.id}
              onToggleNotes={() => setNotesRow((prev) => (prev === stack.song.id ? null : stack.song.id))}
              projectId={projectId}
              projects={projects}
              onMoveBy={projectId ? (by) => moveBy(stack.song.id, by) : undefined}
              onPlay={(versionId, seekMs) => playFrom(stack.song.id, versionId, seekMs)}
              selected={selected.includes(stack.song.id)}
              selecting={selected.length > 0}
              onToggleSelect={() =>
                setSelected((prev) =>
                  prev.includes(stack.song.id) ? prev.filter((id) => id !== stack.song.id) : [...prev, stack.song.id],
                )
              }
            />
          ))}
        </ol>
      )}

      {selected.length > 0 && (
        <div className="rec-selectbar" role="toolbar" aria-label="Selected tracks">
          <span>{selected.length} selected</span>
          <button
            type="button"
            className="rec-pill is-accent"
            disabled={selected.length < 2}
            onClick={() => void joinSelected()}
            title={selected.length < 2 ? 'Select two or more' : undefined}
          >
            <StackIcon size={16} />
            Join as versions
          </button>
          <button type="button" className="rec-pill is-quiet" onClick={() => setSelected([])}>
            Cancel
          </button>
        </div>
      )}

      {quick && (
        <div className="send-sheet-backdrop" onClick={() => !quick.busy && setQuick(null)}>
          <div className="send-sheet is-narrow" role="dialog" aria-modal="true" aria-label="Share" onClick={(e) => e.stopPropagation()}>
            <div className="send-sheet-head">
              <h2 className="send-sheet-title">
                {quick.busy ? 'Making your link…' : quick.error ? 'That did not work' : quick.copied ? 'Link copied' : 'Your link'}
              </h2>
              <button type="button" className="send-sheet-close" onClick={() => setQuick(null)} aria-label="Close">
                ✕
              </button>
            </div>
            {quick.error && <p className="send-sheet-error">{quick.error}</p>}
            {quick.url && (
              <>
                <p className="send-sheet-note">
                  Anyone with it can listen and leave notes. No account needed. Works for 30 days.
                </p>
                <div className="send-sheet-url">
                  <input readOnly value={quick.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(quick.url!)
                        .then(() => setQuick({ ...quick, copied: true }))
                        .catch(() => undefined)
                    }
                  >
                    Copy
                  </button>
                </div>
              </>
            )}
            <div className="send-sheet-actions">
              <button
                type="button"
                className="send-sheet-secondary"
                disabled={quick.busy}
                onClick={() => {
                  setQuick(null)
                  setSending(true)
                }}
              >
                Settings
              </button>
              {quick.url && (
                <a className="send-sheet-secondary" href={quick.url} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              )}
              <button type="button" className="send-sheet-primary" disabled={quick.busy} onClick={() => setQuick(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {sending && (
        <ShareCollectionSheet
          stacks={ordered}
          onClose={() => setSending(false)}
          onCreated={() => {}}
          defaults={project ? { title: project.title, artist: project.artist || artist, coverPath: project.coverPath } : undefined}
        />
      )}

      {editing && project && (
        <ProjectSheet
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false)
            onBack()
          }}
        />
      )}
    </div>
  )
}

/**
 * "Make offline", like Google Drive (17 Sept, Owen): offline was one of the
 * best things about the Songwriting board, so a Listen playlist can do it
 * too. Saves every version in the playlist onto this device, then plays
 * without a connection. Done is read from the files themselves, so it stays
 * true across visits.
 */
/** True while some track here streams from the cloud rather than this device. */
function needsOffline(versions: AudioVersion[]) {
  return versions.some((v) => !v.localBlobId && v.storagePath)
}

function OfflineButton({ versions }: { versions: AudioVersion[] }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const reachable = versions.filter((v) => v.localBlobId || v.storagePath)
  const missing = reachable.filter((v) => !v.localBlobId)
  if (!reachable.length) return null

  if (progress) {
    return (
      <span className="rec-pill is-quiet rec-offline is-busy" aria-live="polite">
        Saving {progress.done} of {progress.total}
      </span>
    )
  }

  if (!missing.length) {
    return (
      <span className="rec-pill is-quiet rec-offline is-done" title="Every track here plays without a connection">
        <CheckIcon size={16} />
        Offline
      </span>
    )
  }

  return (
    <button
      type="button"
      className="rec-pill is-quiet rec-offline"
      onClick={() => {
        void (async () => {
          setFailed(false)
          void requestStoragePersistence()
          const total = missing.length
          setProgress({ done: 0, total })
          let errors = 0
          for (const [i, v] of missing.entries()) {
            try {
              await cacheRemoteAudioVersion(v.id)
            } catch {
              errors++
            }
            setProgress({ done: i + 1, total })
          }
          setProgress(null)
          setFailed(errors > 0)
        })()
      }}
      title="Save every track to this device so it plays without a connection"
    >
      <DownloadIcon size={16} />
      {failed ? 'Try again' : 'Make offline'}
    </button>
  )
}

function PlayAllButton({
  disabled,
  onPlay,
  songIds,
}: {
  disabled: boolean
  onPlay: () => void
  songIds: string[]
}) {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentSongId = usePlayerStore((s) => s.currentSongId)
  const playingHere = !!currentSongId && songIds.includes(currentSongId)
  const showPause = playingHere && isPlaying
  return (
    <button
      type="button"
      className="rec-pill is-primary"
      disabled={disabled}
      onClick={() => {
        if (playingHere) usePlayerStore.getState().setPlaying(!isPlaying)
        else onPlay()
      }}
    >
      {showPause ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      {showPause ? 'Pause' : 'Play'}
    </button>
  )
}
