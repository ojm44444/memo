import { useLiveQuery } from 'dexie-react-hooks'
import { getSongsWithMixes } from '@/db/repositories/audioRepo'
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
  const { currentSongId, isPlaying } = usePlayerStore()
  const { openDrawer } = useUiStore()

  if (mixes === undefined) return null

  if (mixes.length === 0) {
    return (
      <div className="mixes-empty">
        <h2 className="mixes-empty-title">Nothing has come back yet.</h2>
        <p>
          When a producer or engineer sends you a mix, import it onto the song it belongs to and
          mark the take as a mix. It shows up here, newest first, so you always know which one is
          the current one.
        </p>
        <p className="mixes-empty-note">
          Your rough takes stay on the Songwriting board. This room is only for what came back.
        </p>
      </div>
    )
  }

  return (
    <div className="mixes-room">
      <div className="mixes-head">
        <h2 className="mixes-title">The mixes that came back</h2>
        <p className="mixes-sub">
          {mixes.length} {mixes.length === 1 ? 'song' : 'songs'}, newest first. Tap to play, tap
          the title to open the song.
        </p>
      </div>

      <ul className="mixes-list">
        {mixes.map(({ song, latest, mixCount }) => {
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
                  void playSongVersion(song.columnSlug, song.id, latest.id)
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
                  <span className={`mix-kind is-${latest.kind ?? 'mix'}`}>
                    {latest.kind === 'master' ? 'Master' : 'Mix'}
                  </span>
                  <span>{latest.label || 'Untitled'}</span>
                  <span className="mix-dot">·</span>
                  <span>{whenReceived(latest.createdAt)}</span>
                  {mixCount > 1 && (
                    <>
                      <span className="mix-dot">·</span>
                      <span>{mixCount} versions</span>
                    </>
                  )}
                </div>
                <CachedWaveform
                  versionId={latest.id}
                  localBlobId={latest.localBlobId}
                  storagePath={latest.storagePath}
                  progress={0}
                  active={active}
                  className="mix-wave"
                />
              </div>

              <span className="mix-time">{formatDuration(latest.durationMs)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
