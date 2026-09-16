import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { AudioVersion } from '@/types/audio-version'
import type { Song } from '@/types/song'
import { db } from '@/db/database'
import { getSongsWithMixes, setAudioVersionKind } from '@/db/repositories/audioRepo'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { playSongAtTimestamp, playSongVersion } from '@/lib/playSongVersion'
import { formatDuration } from '@/lib/audio-utils'
import { getMyDisplayName } from '@/lib/displayName'
import { scheduleFlush } from '@/sync/syncEngine'
import { SongComments } from '@/components/song/SongComments'
import { RecordArt, RecordMenu } from '@/components/share/RecordParts'
import { kindName } from '@/lib/kindName'
import {
  CheckIcon,
  CommentIcon,
  EqIcon,
  LinkIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  ShuffleIcon,
  StackIcon,
} from '@/components/ui/Icons'
import { MixImport } from './MixImport'
import { SentCollections } from './SentCollections'
import { ShareCollectionSheet } from './ShareCollectionSheet'
import '@/styles/record.css'

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
}: {
  stack: Stack
  index: number
  chosenId: string | null
  onChoose: (versionId: string) => void
  notesOpen: boolean
  onToggleNotes: () => void
}) {
  const { song, versions } = stack
  const isCurrent = usePlayerStore((s) => s.currentSongId === song.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const chosen = versions.find((v) => v.id === chosenId) ?? stack.latest
  const playing = isCurrent && isPlaying
  const noteCount = useLiveQuery(
    () => db.songComments.where('songId').equals(song.id).filter((c) => !c.deletedAt).count(),
    [song.id],
  )

  const chooseAndPlay = (version: AudioVersion) => {
    onChoose(version.id)
    const player = usePlayerStore.getState()
    const currentMs = player.currentSongId === song.id ? player.progress * (chosen.durationMs || 0) : 0
    if (currentMs > 0) {
      const clamped = Math.min(currentMs, Math.max(0, (version.durationMs || 0) - 250))
      void playSongAtTimestamp(song.columnSlug, song.id, version.id, clamped)
      return
    }
    void playSongVersion(song.columnSlug, song.id, version.id)
  }

  const togglePlay = () => {
    const player = usePlayerStore.getState()
    if (isCurrent) {
      player.setPlaying(!player.isPlaying)
      return
    }
    void playSongVersion(song.columnSlug, song.id, chosen.id)
  }

  const cloud = chosen.storagePath ? null : chosen.uploadBlockedReason ? 'blocked' : 'uploading'
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <li className={`rec-row${isCurrent ? ' is-current' : ''}`}>
      <div
        className="rec-line"
        role="button"
        tabIndex={0}
        aria-label={`${playing ? 'Pause' : 'Play'} ${song.title}`}
        onClick={togglePlay}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            togglePlay()
          }
        }}
      >
        <span className="rec-num">
          {isCurrent ? (
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

        <span className="rec-name">
          <span className="rec-name-title">{song.title}</span>
          <span className={`rec-name-kind is-${chosen.kind ?? 'mix'}`}>{kindName(chosen.kind)}</span>
          {cloud === 'uploading' && <span className="rec-name-warn">Uploading</span>}
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
                className="rec-stat"
                aria-expanded={open}
                aria-label={`${versions.length} versions of ${song.title}`}
                onClick={toggle}
              >
                <StackIcon size={17} />
                <span>v{versions.length}</span>
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
                    className="rec-menu-item"
                    onClick={() => {
                      close()
                      chooseAndPlay(version)
                    }}
                  >
                    <span>{version.id === chosen.id ? <CheckIcon size={16} /> : null}</span>
                    <span>
                      v{versions.length - i} · {kindName(version.kind)}
                      <small>
                        {version.label || 'Untitled'} · {whenReceived(version.createdAt)}
                      </small>
                    </span>
                    <span className="rec-menu-meta">{formatDuration(version.durationMs)}</span>
                  </button>
                ))}
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
                <button
                  type="button"
                  role="menuitem"
                  className="rec-menu-item"
                  onClick={() => {
                    close()
                    useUiStore.getState().openDrawer(song.id)
                  }}
                >
                  <span />
                  <span>Open the song</span>
                  <span />
                </button>
                {(['demo', 'mix', 'master'] as const)
                  .filter((k) => k !== (chosen.kind ?? 'mix'))
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      className="rec-menu-item"
                      onClick={() => {
                        close()
                        void setAudioVersionKind(chosen.id, k).then(() => scheduleFlush())
                      }}
                    >
                      <span />
                      <span>Call this version a {kindName(k).toLowerCase()}</span>
                      <span />
                    </button>
                  ))}
                <button
                  type="button"
                  role="menuitem"
                  className="rec-menu-item is-danger"
                  onClick={() => {
                    close()
                    void setAudioVersionKind(chosen.id, 'take').then(() => scheduleFlush())
                  }}
                >
                  <span />
                  <span>
                    Take out of Listen
                    <small>It stays on the song as a rough take.</small>
                  </span>
                  <span />
                </button>
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

export function MixesRoom() {
  const mixes = useLiveQuery(() => getSongsWithMixes(), [])
  const [pickedVersion, setPickedVersion] = useState<Record<string, string>>({})
  const [notesRow, setNotesRow] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sentKey, setSentKey] = useState(0)
  const [artist, setArtist] = useState('')

  useEffect(() => {
    let live = true
    void getMyDisplayName().then((name) => live && setArtist(name === 'You' ? '' : name))
    return () => {
      live = false
    }
  }, [])

  const ordered = useMemo(() => {
    if (!mixes) return []
    const rank = (s: Stack) => (s.latest.kind === 'master' ? 0 : s.latest.kind === 'mix' ? 1 : 2)
    return [...mixes].sort((a, b) => rank(a) - rank(b))
  }, [mixes])

  if (mixes === undefined) return null

  const totalMs = ordered.reduce((sum, s) => {
    const chosen = s.versions.find((v) => v.id === pickedVersion[s.song.id]) ?? s.latest
    return sum + (chosen.durationMs || 0)
  }, 0)
  const uploading = ordered.flatMap((s) => s.versions).filter((v) => !v.storagePath && !v.uploadBlockedReason).length

  const playAll = (shuffle: boolean) => {
    if (!ordered.length) return
    const items = ordered.map((s) => {
      const chosen = s.versions.find((v) => v.id === pickedVersion[s.song.id]) ?? s.latest
      return { songId: s.song.id, audioVersionId: chosen.id, songTitle: s.song.title, columnSlug: s.song.columnSlug }
    })
    if (shuffle) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
    }
    const first = items[0]
    const player = usePlayerStore.getState()
    player.setPlaylist(first.columnSlug, items, 0, first.audioVersionId)
    usePlayerStore.setState({ isPlaying: true, pendingSeekMs: null })
  }

  return (
    <div className="rec">
      <section className="rec-hero">
        <RecordArt seed={`listen-${artist}`} label="Listen" />
        <div>
          <p className="rec-eyebrow">
            {ordered.length} {ordered.length === 1 ? 'track' : 'tracks'}
            {totalMs ? ` · ${formatDuration(totalMs)}` : ''}
          </p>
          <h2 className="rec-title">Listen</h2>
          <p className="rec-artist">{artist ? `${artist} · demos, mixes and masters` : 'Demos, mixes and masters'}</p>

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
            <div className="rec-actions-end">
              <MixImport variant="circle" />
              <button
                type="button"
                className="rec-pill is-accent"
                disabled={!ordered.length}
                onClick={() => setSending(true)}
              >
                Share
                <LinkIcon size={17} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {uploading > 0 && (
        <p className="rec-status">
          <span className="rec-status-dot" aria-hidden />
          {uploading} {uploading === 1 ? 'file is' : 'files are'} uploading. Keep songdrafts open; they can be shared
          once they finish.
        </p>
      )}

      {ordered.length === 0 ? (
        <MixImport variant="empty" />
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
            />
          ))}
        </ol>
      )}

      <SentCollections refreshKey={sentKey} />

      {sending && (
        <ShareCollectionSheet
          stacks={ordered}
          onClose={() => setSending(false)}
          onCreated={() => setSentKey((n) => n + 1)}
        />
      )}
    </div>
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
