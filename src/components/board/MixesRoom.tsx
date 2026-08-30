import { useLiveQuery } from 'dexie-react-hooks'
import { getSongsWithMixes } from '@/db/repositories/audioRepo'
import { useState } from 'react'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { playSongVersion } from '@/lib/playSongVersion'
import { formatDuration } from '@/lib/audio-utils'
import { CachedWaveform } from '@/components/audio/CachedWaveform'

/**
 * Listen: the mixes that came back.
 *
 * NOT a favourites list. Favourites are a filter on your own work; this is the
 * room where other people's work arrives - the rough mix from the producer,
 * mix 2, the master from the engineer. Different audience, different level of
 * mess you are willing to show, which is the real line between this and the
 * songwriting board.
 *
 * Built for a sofa and a phone: big rows, one tap to play, newest first,
 * nothing to drag.
 */
function whenReceived(iso: string | null | undefined) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function MixesRoom() {
  const mixes = useLiveQuery(() => getSongsWithMixes(), [])
  /**
   * Which version of each stack is armed.
   *
   * The top of the stack (the newest mix) plays by default and is the only
   * one that plays when you work down the room, which is the point of a stack:
   * V3 supersedes V2, and you do not want to sit through all three to hear
   * where the song got to. Reaching into the stack and picking V1 is the
   * exception, so it is per-row state and it resets when you leave the room.
   */
  const [pickedVersion, setPickedVersion] = useState<Record<string, string>>({})
  const { currentSongId, isPlaying } = usePlayerStore()
  const { openDrawer } = useUiStore()

  if (mixes === undefined) return null

  if (mixes.length === 0) {
    return (
      <div className="mixes-empty">
        <h2 className="mixes-empty-title">Nothing has come back yet.</h2>
        <p>
          When a mix or a master comes back from a producer or an engineer, it lands here. Each
          song keeps a stack, newest on top, so V3 sits above V2 and you always know which one is
          the current one.
        </p>
        <p className="mixes-empty-note">
          Your rough takes stay on the Songwriting board. This room is for finished audio, and
          it plays the top of each stack so you can listen straight through.
        </p>
      </div>
    )
  }

  return (
    <div className="mixes-room">
      <div className="mixes-head">
        <h2 className="mixes-title">The mixes that came back</h2>
        <p className="mixes-sub">
          {mixes.length} {mixes.length === 1 ? 'song' : 'songs'}, newest first. Plays the top of
          each stack. Pick a V to hear an earlier one.
        </p>
      </div>

      <ul className="mixes-list">
        {mixes.map(({ song, latest, mixCount, versions }) => {
          const chosen = versions.find((v) => v.id === pickedVersion[song.id]) ?? latest
          const active = currentSongId === song.id && isPlaying
          return (
            <li key={song.id} className={`mix-row${active ? ' is-playing' : ''}`}>
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
                  onClick={() => openDrawer(song.id)}
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

                {/* The stack. Newest is V{n}, and it is the one armed unless
                    you say otherwise. Shown only when there is a stack to
                    reach into. */}
                {mixCount > 1 && (
                  <div className="mix-stack" role="group" aria-label={`Versions of ${song.title}`}>
                    {versions.map((version, i) => {
                      const number = versions.length - i
                      const isChosen = version.id === chosen.id
                      return (
                        <button
                          key={version.id}
                          type="button"
                          className={`mix-stack-v${isChosen ? ' is-chosen' : ''}`}
                          aria-pressed={isChosen}
                          title={`${version.label || `Version ${number}`} · ${whenReceived(version.createdAt)}`}
                          onClick={() => {
                            setPickedVersion((prev) => ({ ...prev, [song.id]: version.id }))
                            void playSongVersion(song.columnSlug, song.id, version.id)
                          }}
                        >
                          V{number}
                          {i === 0 && <span className="mix-stack-top">top</span>}
                        </button>
                      )
                    })}
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
