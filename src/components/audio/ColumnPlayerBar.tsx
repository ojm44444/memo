import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getPlaybackPositionMs,
  setPlaybackPositionMs,
} from '@/lib/audio/playbackPosition'
import {
  registerAudioEl,
  consumeSrcSwitchPending,
  markSrcSwitch,
  markRealSrcSet,
  isRealAudioSrc,
} from '@/lib/audio/globalAudioEl'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { presignPlaybackUrls, resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { loadingLabel, useLoadProgress } from '@/stores/loadProgressStore'
import { useUiStore } from '@/stores/uiStore'
import { SpeedControl } from './SpeedControl'
import { PlayerLoopButton } from './PlayerLoopButton'
import { PlayerQueueDrawer } from './PlayerQueueDrawer'
import { InteractiveWaveform } from './InteractiveWaveform'
import { getMarkersForVersion } from '@/db/repositories/markerRepo'
import { RecordArt } from '@/components/share/RecordParts'
import '@/styles/record.css'
import '@/styles/playback-progress.css'

/** A take streaming from the cloud, as opposed to a file on this device. */
function isRemoteSrc(el: HTMLMediaElement) {
  return isRealAudioSrc(el) && !(el.getAttribute('src') ?? '').startsWith('blob:')
}

/** How much of the file the element holds, 0 to 1, or null before the length is known. */
function bufferedFraction(el: HTMLMediaElement): number | null {
  if (!el.duration || !Number.isFinite(el.duration) || el.buffered.length === 0) return null
  return el.buffered.end(el.buffered.length - 1) / el.duration
}

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
    expanded,
    setPlaying,
    setProgress,
    setPlaybackRate,
    playNextInColumn,
    playPreviousInColumn,
    advanceAtEnd,
    playlistSource,
    playlist,
    currentIndex,
    setExpanded,
    queueOpen,
    toggleQueueOpen,
    pendingSeekMs,
    clearPendingSeek,
    buffering,
    setBuffering,
    loadRequest,
    playbackNotice,
    setPlaybackNotice,
  } = usePlayerStore()

  const openDrawer = useUiStore((s) => s.openDrawer)
  const loadingVersionId = useLoadProgress((s) => s.versionId)
  const loadFraction = useLoadProgress((s) => s.fraction)
  const loading = loadingVersionId != null && loadingVersionId === currentVersionId

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
    // Whatever was loading belongs to the previous take.
    useLoadProgress.getState().done()

    async function loadSource() {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      if (!version || !audioRef.current || !currentSongId) return
      // The live query can still hold the previous take for a moment after a
      // tap. Loading it would put the old song back on the element.
      if (currentVersionId && version.id !== currentVersionId) return

      // A cloud take can take a while. Say so from the tap onwards.
      const fromCloud = !version.localBlobId && Boolean(version.storagePath)
      if (fromCloud) useLoadProgress.getState().start(version.id)

      const seekMs = pendingSeekMsRef.current
      pendingSeekMsRef.current = null
      clearPendingSeek()

      const [savedMs, url] = await Promise.all([
        seekMs != null ? Promise.resolve(seekMs) : getPlaybackPositionMs(currentSongId),
        resolvePlaybackUrl(version.localBlobId, version.storagePath),
      ])

      if (cancelled || !audioRef.current) return

      if (!url) {
        useLoadProgress.getState().done(version.id)
        setPlaying(false)
        setBuffering(false)
        // Cloud-only take and no connection: say so instead of doing nothing.
        if (version.storagePath && !version.localBlobId) {
          setPlaybackNotice(
            navigator.onLine ? 'Could not load this take. Try again.' : 'Not on this device yet. Plays when online.',
          )
        }
        return
      }
      setPlaybackNotice(null)

      if (version.localBlobId) {
        objectUrlRef.current = null
      }

      // trimStartMs always wins — "start here every time" overrides saved position
      const effectiveStartMs =
        (version.trimStartMs ?? 0) > 0 ? version.trimStartMs! : savedMs > 0 ? savedMs : 0
      resumeSeekRef.current = effectiveStartMs > 0 ? effectiveStartMs : null

      const sameUrl = audioRef.current.src === url && isRealAudioSrc(audioRef.current)
      if (sameUrl) {
        // No new load, so no canplay is coming. Mark ready ourselves or the
        // play/pause effect below would ignore this source.
        if (audioRef.current.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          setSourceReady(true)
          setBuffering(false)
          useLoadProgress.getState().done(version.id)
        }
      } else {
        markSrcSwitch()
        // Claim the element before the unlock's SILENT promise resolves and
        // tries to restore the old src. Without this the first play of a
        // session loads correctly and is then paused and wiped.
        markRealSrcSet()
        audioRef.current.src = url
      }
      setAudioUrl(url)

      /**
       * Actually start playing.
       *
       * This step was missing entirely: loadSource armed the source and then
       * nothing called play(), so the first click on a card only selected the
       * song and left the element on the silent unlock placeholder. The second
       * click hit the player bar's own toggle, which is why playback "needed
       * two clicks" for as long as anyone can remember.
       *
       * Fixing it here rather than in SongCard covers every entry point at
       * once — card play, column Play, the Recent strip, playlists — because
       * they all funnel through the store into this effect.
       *
       * isPlaying is read from the store rather than closed over, so this
       * effect does not re-run (and re-load the source) on every pause.
       */
      if (usePlayerStore.getState().isPlaying) {
        try {
          await audioRef.current.play()
        } catch (err) {
          // Autoplay refused (no gesture, or the tab is backgrounded). Reflect
          // reality in the UI rather than showing a play state that is not real.
          // AbortError only means a newer source replaced this one mid-start.
          if (!cancelled && (err as Error)?.name !== 'AbortError') setPlaying(false)
        }
      }
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
    currentVersionId,
    // Bumped by every explicit "play this" tap, so the same song reloads its
    // source after the tap's unlock clip borrowed the element.
    loadRequest,
    clearPendingSeek,
    setPlaying,
    setBuffering,
    setPlaybackNotice,
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

  // Paused (or play refused): iOS fetches nothing until play, so a
  // "Loading" line would sit there forever. It comes back on the next wait.
  useEffect(() => {
    if (!isPlaying) useLoadProgress.getState().done()
  }, [isPlaying])

  // Media Session API — lock screen / AirPods / CarPlay controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!displaySong) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displaySong.title,
      artist: 'songdrafts',
      album: version?.label ?? undefined,
      // Full-bleed square (17 Sept, Owen: not the round icon on the lock screen).
      artwork: [{ src: '/brand/now-playing-square-512.png', sizes: '512x512', type: 'image/png' }],
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
    // Never drive the silent unlock clip or an empty element: play() on those
    // fails and would flip isPlaying off before the real song arrives.
    if (!isRealAudioSrc(audio)) return

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
    // The store decides what is next, and a Listen playlist never falls
    // through to the board (see advanceAtEnd in playerStore).
    await advanceAtEnd()
  }

  /* Sign the next cloud take while this one plays, so moving on does not wait
     for a round trip. Signing only: no audio is fetched ahead. */
  const nextVersionId = playlist[currentIndex + 1]?.audioVersionId ?? null
  useEffect(() => {
    if (!sourceReady || !nextVersionId) return
    let live = true
    void db.audioVersions.get(nextVersionId).then((next) => {
      if (live && next && !next.localBlobId && next.storagePath) void presignPlaybackUrls([next.storagePath])
    })
    return () => {
      live = false
    }
  }, [sourceReady, nextVersionId])

  /* The waveform decodes the whole file. For a cloud take that is a second
     full download racing the stream for the same connection, which is a large
     part of why big WAVs were slow to start. Hand it over once the stream has
     the whole file; saved peaks show until then. */
  const waveUrl =
    audioUrl && (audioUrl.startsWith('blob:') || bufferProgress >= 0.999) ? audioUrl : null

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
          if (!isRealAudioSrc(element)) return
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
          // The unlock clip fires canplay too. Only the real song counts.
          if (!isRealAudioSrc(event.currentTarget)) return
          setSourceReady(true)
          setBuffering(false)
          useLoadProgress.getState().done(currentVersionId)
          if (usePlayerStore.getState().isPlaying) {
            void event.currentTarget.play().catch((err: Error) => {
              if (err?.name !== 'AbortError') setPlaying(false)
            })
          }
        }}
        onError={(event) => {
          if (!isRealAudioSrc(event.currentTarget)) return
          console.warn('[songdrafts] audio element error', event.currentTarget.error)
          useLoadProgress.getState().done()
          setBuffering(false)
          setPlaying(false)
          if (!navigator.onLine && version?.storagePath && !version.localBlobId) {
            setPlaybackNotice('Not on this device yet. Plays when online.')
          }
        }}
        onWaiting={(event) => {
          const el = event.currentTarget
          if (!isRealAudioSrc(el)) return
          setBuffering(true)
          // Ran dry mid-song on a cloud take: show how much has arrived.
          if (currentVersionId && isRemoteSrc(el)) {
            useLoadProgress.getState().start(currentVersionId)
            const fraction = bufferedFraction(el)
            if (fraction != null) useLoadProgress.getState().update(currentVersionId, fraction)
          }
        }}
        onPlaying={(event) => {
          if (!isRealAudioSrc(event.currentTarget)) return
          setBuffering(false)
          useLoadProgress.getState().done(currentVersionId)
        }}
        onDurationChange={(event) => {
          const el = event.currentTarget
          const fraction = isRealAudioSrc(el) ? bufferedFraction(el) : null
          if (currentVersionId && fraction != null) useLoadProgress.getState().update(currentVersionId, fraction)
        }}
        onProgress={(event) => {
          const el = event.currentTarget
          if (!isRealAudioSrc(el)) return
          const fraction = bufferedFraction(el)
          if (fraction == null) return
          setBufferProgress(fraction)
          if (currentVersionId) useLoadProgress.getState().update(currentVersionId, fraction)
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget
          if (!isRealAudioSrc(element)) return
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
        onPause={(event) => {
          // The unlock clip pausing (or a source being cleared) is not the
          // person pausing.
          if (!isRealAudioSrc(event.currentTarget)) return
          if (currentSongId && audioRef.current) {
            void setPlaybackPositionMs(currentSongId, audioRef.current.currentTime * 1000)
          }
          if (consumeSrcSwitchPending()) return
          if (!programmaticPauseRef.current) {
            setPlaying(false)
          }
          programmaticPauseRef.current = false
        }}
        onEnded={(event) => {
          // The 1-sample unlock clip "ends" too. That must never skip a song.
          if (!isRealAudioSrc(event.currentTarget)) return
          void handleEnded()
        }}
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
                audioUrl={waveUrl}
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
            {/* The same generated cover as Listen, keyed to the song, so a
                song keeps one face everywhere it plays. */}
            <RecordArt
              seed={displaySong!.id}
              label=""
              className="player-bar-thumb player-bar-cover"
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
                  {playbackNotice ? (
                    <span role="status">{playbackNotice}</span>
                  ) : loading ? (
                    <span className="pp-bar-status" role="status">
                      <span className="pp-spinner pp-spinner--small" aria-hidden />
                      {loadingLabel(loadFraction)}
                    </span>
                  ) : (
                    version?.label
                  )}
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
                    audioUrl={waveUrl}
                    cacheKey={currentVersionId ?? undefined}
                    progress={progress}
                    active={isPlaying && !buffering}
                    height={40}
                    onSeek={seekTo}
                  />
                  {(buffering || loading) && (
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
                  {buffering || (loading && isPlaying) ? <span className="player-bar-spinner" /> : isPlaying ? '❚❚' : '▶'}
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
