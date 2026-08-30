import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { AudioVersion } from '@/types/audio-version'
import type { Song } from '@/types/song'
import { getSongsWithMixes } from '@/db/repositories/audioRepo'
import { usePlayerStore } from '@/stores/playerStore'
import { playSongAtTimestamp, playSongVersion } from '@/lib/playSongVersion'
import { formatDuration } from '@/lib/audio-utils'
import { CachedWaveform } from '@/components/audio/CachedWaveform'
import { SongComments } from '@/components/song/SongComments'
import { MixUpload } from './MixUpload'

/**
 * Listen: the mixes that came back.
 *
 * NOT a favourites list. Favourites are a filter on your own work; this is the
 * room where other people's work arrives - the rough mix from the producer,
 * mix 2, the master from the engineer. Different audience, different level of
 * mess you are willing to show, which is the real line between this and the
 * songwriting board.
 *
 * A row here is a STACK, not a song card. It deliberately does not open into
 * the songwriting drawer: a stack is a simpler object than a song, and the
 * point of this room is that you are listening rather than working. Expanding
 * a row gets you the one thing you actually want while listening, which is
 * the comments.
 */

type Stack = { song: Song; latest: AudioVersion; mixCount: number; versions: AudioVersion[] }

function whenReceived(iso: string | null | undefined) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function StackRow({
  stack,
  chosenId,
  onChoose,
  expanded,
  onToggleExpand,
}: {
  stack: Stack
  chosenId: string | null
  onChoose: (versionId: string) => void
  expanded: boolean
  onToggleExpand: () => void
}) {
  const { song, versions, mixCount } = stack
  const { currentSongId, isPlaying } = usePlayerStore()
  const chosen = versions.find((v) => v.id === chosenId) ?? stack.latest
  const active = currentSongId === song.id && isPlaying

  /**
   * A/B, not restart.
   *
   * The only way to hear what changed between V2 and V3 is to hear the SAME
   * BAR twice. Restarting the new version from zero destroys that: by the time
   * you have scrubbed back to the chorus you have lost the sound of the one
   * you were comparing it against. So while a song is playing, swapping
   * version lands at the same elapsed position and keeps going.
   *
   * Matched in milliseconds rather than as a fraction, because two mixes of
   * one song are rarely the same length and a fraction would drift further out
   * the longer the song ran.
   */
  const chooseAndPlay = (version: AudioVersion) => {
    onChoose(version.id)
    const player = usePlayerStore.getState()
    const playingThis = player.currentSongId === song.id
    const currentMs = playingThis ? player.progress * (chosen.durationMs || 0) : 0

    if (playingThis && currentMs > 0) {
      const clamped = Math.min(currentMs, Math.max(0, (version.durationMs || 0) - 250))
      void playSongAtTimestamp(song.columnSlug, song.id, version.id, clamped)
      return
    }
    void playSongVersion(song.columnSlug, song.id, version.id)
  }

  return (
    <li className={`mix-row${active ? ' is-playing' : ''}${expanded ? ' is-open' : ''}`}>
      <div className="mix-row-main">
        <button
          type="button"
          className="mix-play"
          aria-label={active ? `Pause ${song.title}` : `Play ${song.title}`}
          onClick={() => {
            if (active) {
              usePlayerStore.getState().setPlaying(false)
              return
            }
            void playSongVersion(song.columnSlug, song.id, chosen.id)
          }}
        >
          {active ? '❚❚' : '▶'}
        </button>

        <div className="mix-body">
          <button
            type="button"
            className="mix-title"
            aria-expanded={expanded}
            onClick={onToggleExpand}
          >
            {song.title}
          </button>

          <div className="mix-meta">
            <span className={`mix-kind is-${chosen.kind ?? 'mix'}`}>
              {chosen.kind === 'master' ? 'Master' : 'Mix'}
            </span>
            <span>{chosen.label || 'Untitled'}</span>
            <span className="mix-dot">·</span>
            <span>{whenReceived(chosen.createdAt)}</span>
          </div>

          {/* The stack. Newest is the highest V and the one armed by default,
              because the last mix is the one that gets used. */}
          {mixCount > 1 && (
            <div className="mix-stack" role="group" aria-label={`Versions of ${song.title}`}>
              {versions.map((version, i) => {
                const number = versions.length - i
                const isChosen = version.id === chosen.id
                return (
                  <button
                    key={version.id}
                    type="button"
                    className={`mix-stack-v${isChosen ? ' is-chosen' : ''}${
                      version.kind === 'master' ? ' is-master' : ''
                    }`}
                    aria-pressed={isChosen}
                    title={`${version.label || `Version ${number}`} · ${whenReceived(
                      version.createdAt,
                    )}${active ? ' · swaps without losing your place' : ''}`}
                    onClick={() => chooseAndPlay(version)}
                  >
                    V{number}
                    {i === 0 && <span className="mix-stack-top">top</span>}
                  </button>
                )
              })}
              {active && <span className="mix-stack-hint">swaps in place</span>}
            </div>
          )}

          <CachedWaveform
            versionId={chosen.id}
            localBlobId={chosen.localBlobId}
            storagePath={chosen.storagePath}
            progress={0}
            active={active}
            className="mix-wave"
          />
        </div>

        <span className="mix-time">{formatDuration(chosen.durationMs)}</span>
      </div>

      {expanded && (
        <div className="mix-row-comments">
          <SongComments songId={song.id} />
        </div>
      )}
    </li>
  )
}

export function MixesRoom() {
  const mixes = useLiveQuery(() => getSongsWithMixes(), [])
  const [pickedVersion, setPickedVersion] = useState<Record<string, string>>({})
  const [openRow, setOpenRow] = useState<string | null>(null)

  if (mixes === undefined) return null

  if (mixes.length === 0) {
    return (
      <div className="mixes-empty">
        <h2 className="mixes-empty-title">Nothing has come back yet.</h2>
        <p>
          Mixes come back the way they always do: a WeTransfer link, a Dropbox folder, a file on an
          email. Download it, drop it here, and it stacks on the song it belongs to. Your engineer
          does not need an account and never touches this.
        </p>
        <p className="mixes-empty-note">
          Each song keeps one stack, newest on top, so V3 sits above V2 and the last one is always
          the current one. Your rough takes stay on the Songwriting board.
        </p>
        <MixUpload />
      </div>
    )
  }

  /**
   * Two sections, split by what sits on TOP of each stack.
   *
   * A master is a different kind of object from a mix: it is the finished
   * thing, the one that goes out. Sorting both into one list by date buries a
   * master under three rough mixes that happened to arrive after it.
   */
  const mastered = mixes.filter((m) => m.latest.kind === 'master')
  const inProgress = mixes.filter((m) => m.latest.kind !== 'master')

  const renderSection = (title: string, note: string, rows: Stack[]) =>
    rows.length > 0 ? (
      <section className="mixes-section">
        <div className="mixes-section-head">
          <h3 className="mixes-section-title">{title}</h3>
          <span className="mixes-section-note">{note}</span>
        </div>
        <ul className="mixes-list">
          {rows.map((stack) => (
            <StackRow
              key={stack.song.id}
              stack={stack}
              chosenId={pickedVersion[stack.song.id] ?? null}
              onChoose={(versionId) =>
                setPickedVersion((prev) => ({ ...prev, [stack.song.id]: versionId }))
              }
              expanded={openRow === stack.song.id}
              onToggleExpand={() =>
                setOpenRow((prev) => (prev === stack.song.id ? null : stack.song.id))
              }
            />
          ))}
        </ul>
      </section>
    ) : null

  return (
    <div className="mixes-room">
      <div className="mixes-head">
        <div>
          <h2 className="mixes-title">The mixes that came back</h2>
          <p className="mixes-sub">
            Plays the top of each stack. Pick a V to hear an earlier one, or to A/B without losing
            your place while it is playing. Tap a title for its comments.
          </p>
        </div>
        <MixUpload />
      </div>

      {renderSection('Masters', 'Finished. This is what goes out.', mastered)}
      {renderSection('Mixes', 'Still moving. The last V is the current one.', inProgress)}
    </div>
  )
}
