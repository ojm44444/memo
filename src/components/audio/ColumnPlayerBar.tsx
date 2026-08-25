import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getPlaybackPositionMs,
  setPlaybackPositionMs,
} from '@/lib/audio/playbackPosition'
import { registerAudioEl, consumeSrcSwitchPending, markSrcSwitch } from '@/lib/audio/globalAudioEl'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { SpeedControl } from './SpeedControl'
import { PlayerLoopButton } from './PlayerLoopButton'
import { PlayerQueueDrawer } from './PlayerQueueDrawer'
import { InteractiveWaveform } from './InteractiveWaveform'
import { getMarkersForVersion } from '@/db/repositories/markerRepo'
import { WaveformThumb } from '@/components/audio/WaveformThumb'

export function ColumnPlayerBar() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const lastSavedMsRef = useRef(0)
  const resumeSeekRef = useRef<number | null>(null)
  // Capture pendingSeekMs in a ref so the load effect can read it once
  // without pendingSeekMs being in the deps array (which would cause a
  // double-load: effect fires with seek value, clearPendingSeek() sets it
  // to null, deps change, effect fires again and reloads the audio source).
  const pendingSeekMsRef = useRef<number | null>(null)
  // Prevents the progress=0 reset effect from wiping a resume seek that
  // was applied in onLoadedMetadata (which fires before onCanPlay/sourceReady).
  const skipProgressResetRef = useRef(false)
  // Distinguishes user-initiated pauses from system-triggered ones (iOS phone
  // call, lock screen) so we can sync isPlaying when the OS pauses audio.
  const programmaticPauseRef = useRef(false)
  const skipRegionsRef = useRef<Array<{ start: number; end: number }>>([])
  const endedRef = useRef(false)
  const [sourceReady, setSourceReady] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [bufferProgress, setBufferProgress] = useState(0)

  const {
    currentVersionId,
    currentSongId,
    isPlaying,
    playbackRate,
    progress,
    activeColumnId,
    expanded,
    setPlaying,
    setProgress,
    setPlaybackRate,
    playNextInColumn,
    playPreviousInColumn,
    playAdjacentColumn,
    playBoardFromStart,
    playColumn,
    playFavourites,
    loopMode,
    playlistSource,
    favouritesScope,
    favouritesShuffle,
    playlist,
    currentIndex,
    setExpanded,
    queueOpen,
    toggleQueueOpen,
    pendingSeekMs,
    clearPendingSeek,
    buffering,
    setBuffering,
  } = usePlayerStore()

  const openDrawer = useUiStore((s) => s.openDrawer)

  // Keep ref in sync with store value so the load effect can consume it once
  if (pendingSeekMs != null) pendingSeekMsRef.current = pendingSeekMs

  const version = useLiveQuery(
    () => (currentVersionId ? db.audioVersions.get(currentVersionId) : undefined),
    [currentVersionId],
  )

  const markers = useLiveQuery(
    () => (currentVersionId ? getMarkersForVersion(currentVersionId) : Promise.resolve([])),
    [currentVersionId],
  )

  // Pre-compute skip regions so onTimeUpdate doesn't allocate arrays every tick
  const skipRegions = useMemo(() => {
    if (!markers || markers.length === 0) return []
    const starts = markers.filter(m => m.type === 'skip-start').sort((a, b) => a.ms - b.ms)
    const ends = markers.filter(m => m.type === 'skip-end').sort((a, b) => a.ms - b.ms)
    return starts.flatMap(s => {
      const end = ends.find(e => e.ms > s.ms)
      return end ? [{ start: s.ms, end: end.ms }] : []
    })
  }, [markers])
  skipRegionsRef.current = skipRegions

  const song = useLiveQuery(
    () => (currentSongId ? db.songs.get(currentSongId) : undefined),
    [currentSongId],
  )

  // Keep the last known song so the player bar never flashes away during
  // background syncs or the brief undefined window when useLiveQuery reruns.
  const lastSongRef = useRef<typeof song>(undefined)
  if (song) lastSongRef.current = song
  const displaySong = song ?? lastSongRef.current

  useEffect(() => {
    let cancelled = false
    setSourceReady(false)
    setAudioUrl(null)
    setBufferProgress(0)
    lastSavedMsRef.current = 0
    endedRef.current = false

    async function loadSource() {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      if (!version || !audioRef.current || !currentSongId) return

      const seekMs = pendingSeekMsRef.current
      pendingSeekMsRef.current = null
      clearPendingSeek()

      const [savedMs, url] = await Promise.all([
        seekMs != null ? Promise.resolve(seekMs) : getPlaybackPositionMs(currentSongId),
        resolvePlaybackUrl(version.localBlobId, version.storagePath),
      ])

      if (cancelled || !audioRef.current) return

      if (!url) {
        setPlaying(false)
        return
      }

      if (version.localBlobId) {
        objectUrlRef.current = null
      }

      // trimStartMs always wins — "start here every time" overrides saved position
      const effectiveStartMs =
        (version.trimStartMs ?? 0) > 0 ? version.trimStartMs! : savedMs > 0 ? savedMs : 0
      resumeSeekRef.current = effectiveStartMs > 0 ? effectiveStartMs : null

      const sameUrl = audioRef.current.src === url
      if (!sameUrl) {
        markSrcSwitch()
        audioRef.current.src = url
      }
      setAudioUrl(url)
    }

    void loadSource()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [
    version?.id,
    version?.localBlobId,
    version?.storagePath,
    currentSongId,
    clearPendingSeek,
    setPlaying,
  ])

  useEffect(() => {
    if (progress === 0 && audioRef.current && sourceReady) {
      if (skipProgressResetRef.current) {
        skipProgressResetRef.current = false
        return
      }
      audioRef.current.currentTime = 0
      setCurrentMs(0)
    }
  }, [progress, sourceReady, currentVersionId])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  // Media Session API — lock screen / AirPods / CarPlay controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!displaySong) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displaySong.title,
      artist: 'songdrafts',
      album: version?.label ?? undefined,
    })
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    const store = usePlayerStore.getState
    navigator.mediaSession.setActionHandler('play', () => setPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false))
    navigator.mediaSession.setActionHandler('stop', () => setPlaying(false))
    navigator.mediaSession.setActionHandler('nexttrack', () => store().playNextInColumn())
    navigator.mediaSession.setActionHandler('previoustrack', () => store().playPreviousInColumn())
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const audio = audioRef.current
      if (!audio || details.seekTime == null) return
      audio.currentTime = details.seekTime
      setProgress(details.seekTime / audio.duration)
    })

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('stop', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [displaySong?.title, version?.label, isPlaying, setPlaying, setProgress])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !sourceReady) return

    if (isPlaying) {
      const wasPaused = audio.paused
      if (wasPaused) audio.volume = 0
      void audio.play().then(() => {
        if (!wasPaused) return
        // Fade in from 0 over ~30ms to eliminate the pop on play start
        let v = 0
        const step = () => {
          v = Math.min(1, v + 0.08)
          audio.volume = v
          if (v < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }).catch((err: Error) => {
        audio.volume = 1
        if (err?.name !== 'AbortError') setPlaying(false)
      })
    } else {
      programmaticPauseRef.current = true
      audio.pause()
      audio.volume = 1
    }
  }, [isPlaying, sourceReady, currentVersionId, setPlaying])

  const handleEnded = async () => {
    if (endedRef.current) return
    endedRef.current = true
    const queueRepeat = usePlayerStore.getState().queueRepeat
    if (queueRepeat) {
      setProgress(0)
      setPlaying(true)
      return
    }

    const next = playNextInColumn()
    if (next) {
      setPlaying(true)
      return
    }

    if (playlistSource === 'favourites' && favouritesScope) {
      if (loopMode === 'section' || loopMode === 'board') {
        const restarted = await playFavourites(favouritesScope, 0, undefined, favouritesShuffle)
        if (restarted) return
      }
      setPlaying(false)
      return
    }

    if (loopMode === 'section' && activeColumnId) {
      const restarted = await playColumn(activeColumnId)
      if (restarted) return
    }

    const advanced = await playAdjacentColumn('next')
    if (advanced) return

    if (loopMode === 'board') {
      const restarted = await playBoardFromStart()
      if (restarted) return
    }

    setPlaying(false)
  }

  const seekTo = (fraction: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = fraction * audio.duration
    setProgress(fraction)
    setCurrentMs(audio.currentTime * 1000)
  }

  // The <audio> element is ALWAYS rendered so it is never unmounted between
  // track changes. Unmounting would lose the iOS gesture-unlock state on the
  // element and force a new unlock cycle on every song tap.
  // Only the visible player bar footer is conditional.
  const showBar = Boolean(currentVersionId && displaySong)

  return (
    <>
      <audio
        ref={(el) => { audioRef.current = el; registerAudioEl(el) }}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget
          setDurationMs(element.duration * 1000)

          const resumeMs = resumeSeekRef.current
          resumeSeekRef.current = null
          if (resumeMs && element.duration && resumeMs < element.duration * 0.92) {
            element.currentTime = resumeMs / 1000
            setProgress(resumeMs / (element.duration * 1000))
            setCurrentMs(resumeMs)
            skipProgressResetRef.current = true
          }
        }}
        onCanPlay={(event) => {
          setSourceReady(true)
          setBuffering(false)
          if (usePlayerStore.getState().isPlaying) {
            void event.currentTarget.play().catch((err: Error) => {
              if (err?.name !== 'AbortError') setPlaying(false)
            })
          }
        }}
        onError={() => {
          setBuffering(false)
          setPlaying(false)
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onProgress={(event) => {
          const el = event.currentTarget
          if (el.buffered.length > 0 && el.duration) {
            setBufferProgress(el.buffered.end(el.buffered.length - 1) / el.duration)
          }
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget
          if (element.duration) {
            const ms = element.currentTime * 1000
            setProgress(element.currentTime / element.duration)
            setCurrentMs(ms)

            // Stop at trimEndMs if set — pause immediately so the native
            // ended event doesn't also fire and call handleEnded twice
            if (version?.trimEndMs && ms >= version.trimEndMs) {
              element.pause()
              void handleEnded()
              return
            }

            // Skip over any skip regions (pre-computed, no allocations per tick)
            for (const region of skipRegionsRef.current) {
              if (ms >= region.start && ms < region.end) {
                element.currentTime = region.end / 1000
                return
              }
            }

            if (currentSongId && ms - lastSavedMsRef.current > 2000) {
              lastSavedMsRef.current = ms
              void setPlaybackPositionMs(currentSongId, ms)
            }
          }
        }}
        onPause={() => {
          if (currentSongId && audioRef.current) {
            void setPlaybackPositionMs(currentSongId, audioRef.current.currentTime * 1000)
          }
          if (consumeSrcSwitchPending()) return
          if (!programmaticPauseRef.current) {
            setPlaying(false)
          }
          programmaticPauseRef.current = false
        }}
        onEnded={() => void handleEnded()}
      />

      {showBar && (
        <footer className={expanded ? 'player-bar player-bar--expanded' : 'player-bar'}>
          {expanded && (
            <div className="player-bar-expanded-panel">
              <div className="player-bar-expanded-header">
                <button
                  type="button"
                  className="player-bar-expanded-title player-bar-song-title"
                  onClick={() => { setExpanded(false); if (currentSongId) openDrawer(currentSongId) }}
                  title="Open song"
                >
                  {displaySong!.title}
                </button>
                <button type="button" className="player-bar-expand-close" onClick={() => setExpanded(false)}>
                  Close
                </button>
              </div>
              <InteractiveWaveform
                audioUrl={audioUrl}
                cacheKey={currentVersionId ?? undefined}
                progress={progress}
                active={isPlaying}
                height={120}
                className="player-bar-wave player-bar-wave--expanded"
                onSeek={seekTo}
              />
              <div className="player-bar-expanded-controls">
                <div className="player-bar-expanded-time">
                  {formatDuration(currentMs)} / {formatDuration(durationMs || version?.durationMs)}
                </div>
                <SpeedControl value={playbackRate} onChange={setPlaybackRate} className="player-bar-expanded-speed" />
              </div>
            </div>
          )}

          <div className="player-bar-inner">
            {/* The song's own waveform in its stage colour, not a generated
                gradient cover. Same renderer as the board card. */}
            <WaveformThumb
              versionId={currentVersionId}
              localBlobId={version?.localBlobId ?? null}
              storagePath={version?.storagePath ?? null}
              columnSlug={displaySong?.columnSlug}
              size={44}
              bars={14}
              className="player-bar-thumb"
            />

            {/* Centre: title/meta + scrubber */}
            <div className="player-bar-center">
              <div className="player-bar-meta">
                <button
                  type="button"
                  className="player-bar-song-title"
                  onClick={() => currentSongId && openDrawer(currentSongId)}
                  title="Open song"
                >
                  {displaySong!.title}
                </button>
                <div className="player-bar-sub">
                  {version?.label}
                  {playlist.length > 1 && (
                    <button
                      type="button"
                      className="player-bar-queue"
                      onClick={() => toggleQueueOpen()}
                      aria-expanded={queueOpen}
                      aria-controls="player-queue-panel"
                      aria-label={`${queueOpen ? 'Close' : 'Open'} play queue, track ${currentIndex + 1} of ${playlist.length}`}
                    >
                      {' '}· {playlistSource === 'favourites' ? '★ ' : ''}{currentIndex + 1}/{playlist.length}
                    </button>
                  )}
                </div>
              </div>

              <div className="player-bar-scrubber">
                <span className="player-bar-time">{formatDuration(currentMs)}</span>
                <div className="player-bar-wave-col">
                  <InteractiveWaveform
                    audioUrl={audioUrl}
                    cacheKey={currentVersionId ?? undefined}
                    progress={progress}
                    active={isPlaying && !buffering}
                    height={40}
                    onSeek={seekTo}
                  />
                  {buffering && (
                    <div className="player-bar-buffer-track">
                      <div
                        className="player-bar-buffer-fill"
                        style={{ width: `${Math.round(bufferProgress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="player-bar-time player-bar-time--dur">
                  {formatDuration(durationMs || version?.durationMs)}
                </span>
              </div>
            </div>

            {/* Right: transport + secondary controls */}
            <div className="player-bar-controls">
              <div className="player-bar-transport">
                <button
                  type="button"
                  className="player-bar-skip"
                  disabled={playlist.length === 0}
                  onClick={() => playPreviousInColumn()}
                  aria-label="Previous"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  onClick={() => { if (!buffering) setPlaying(!isPlaying) }}
                  className={`player-bar-play${buffering ? ' player-bar-buffering' : ''}`}
                  aria-label={buffering ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
                >
                  {buffering ? <span className="player-bar-spinner" /> : isPlaying ? '❚❚' : '▶'}
                </button>
                <button
                  type="button"
                  className="player-bar-skip"
                  disabled={playlist.length === 0 || currentIndex >= playlist.length - 1}
                  onClick={() => playNextInColumn()}
                  aria-label="Next"
                >
                  ⏭
                </button>
              </div>
              <PlayerLoopButton />
              <SpeedControl value={playbackRate} onChange={setPlaybackRate} className="player-bar-speed" />
            </div>
          </div>
          <PlayerQueueDrawer />
        </footer>
      )}
    </>
  )
}
