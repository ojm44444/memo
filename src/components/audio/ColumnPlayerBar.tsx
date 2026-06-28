import { useEffect, useRef, useState } from 'react'
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

  const song = useLiveQuery(
    () => (currentSongId ? db.songs.get(currentSongId) : undefined),
    [currentSongId],
  )

  useEffect(() => {
    let cancelled = false
    setSourceReady(false)
    setAudioUrl(null)
    setBufferProgress(0)

    async function loadSource() {
      // Local blobs are now cached in resolvePlaybackUrl — no need to revoke
      // previous objectUrlRef here unless it was a non-cached temporary URL.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      if (!version || !audioRef.current || !currentSongId) return

      // Consume pending seek once, then clear it. Running clearPendingSeek()
      // here (outside the async body) avoids a dep-triggered double-load.
      const seekMs = pendingSeekMsRef.current
      pendingSeekMsRef.current = null
      clearPendingSeek()

      // Fetch saved position and resolve URL in parallel
      const [savedMs, url] = await Promise.all([
        seekMs != null ? Promise.resolve(seekMs) : getPlaybackPositionMs(currentSongId),
        resolvePlaybackUrl(version.localBlobId, version.storagePath),
      ])

      if (cancelled || !audioRef.current) return

      if (!url) {
        setPlaying(false)
        return
      }

      // Only track non-cached URLs for manual revocation on cleanup
      if (version.localBlobId) {
        // URL is owned by the module cache — don't revoke on cleanup
        objectUrlRef.current = null
      }

      // Prefer explicit seek > saved resume position > trim start offset
      const effectiveStartMs =
        savedMs > 0 ? savedMs : (version.trimStartMs ?? 0) > 0 ? version.trimStartMs! : 0
      resumeSeekRef.current = effectiveStartMs > 0 ? effectiveStartMs : null

      // If playAudioImmediately() already set this src (gesture-handler fast
      // path), don't reset it — play() is async so paused may still be true
      // even though playback was initiated. Resetting src would cancel it.
      const sameUrl = audioRef.current.src === url
      if (!sameUrl) {
        markSrcSwitch()
        audioRef.current.src = url
      }
      setAudioUrl(url)
      // sourceReady will be set true by the onCanPlay handler below
    }

    void loadSource()

    return () => {
      cancelled = true
      // Only revoke if we held a non-cached temporary URL
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
    // pendingSeekMs intentionally excluded — consumed via pendingSeekMsRef
    // to prevent a double-load when clearPendingSeek() changes the store.
    clearPendingSeek,
    setPlaying,
  ])

  useEffect(() => {
    if (progress === 0 && audioRef.current && sourceReady) {
      // Skip if onLoadedMetadata already seeked to a resume position —
      // onLoadedMetadata fires before onCanPlay so the seek lands first,
      // then sourceReady becomes true and this effect would reset it to 0.
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

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !sourceReady) return

    if (isPlaying) {
      void audio.play().catch((err: Error) => { if (err?.name !== 'AbortError') setPlaying(false) })
    } else {
      programmaticPauseRef.current = true
      audio.pause()
    }
  }, [isPlaying, sourceReady, currentVersionId, setPlaying])

  const handleEnded = async () => {
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

  if (!currentVersionId || !song) return null

  return (
    <footer className={expanded ? 'player-bar player-bar--expanded' : 'player-bar'}>
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
            // Tell the progress=0 reset effect to skip its next run — it fires
            // after onCanPlay sets sourceReady=true and would otherwise undo this seek.
            skipProgressResetRef.current = true
          }
        }}
        onCanPlay={(event) => {
          setSourceReady(true)
          setBuffering(false)
          // Call play() directly from the browser event rather than waiting
          // for the sourceReady state change to propagate through React —
          // this eliminates a render cycle and works more reliably on mobile.
          if (usePlayerStore.getState().isPlaying) {
            void event.currentTarget.play().catch((err: Error) => {
              if (err?.name !== 'AbortError') setPlaying(false)
            })
          }
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
          // Ignore pause events caused by switching to a new src (song switch).
          // Programmatic pauses (user clicked pause) set programmaticPauseRef first.
          if (consumeSrcSwitchPending()) return
          if (!programmaticPauseRef.current) {
            setPlaying(false)
          }
          programmaticPauseRef.current = false
        }}
        onEnded={() => void handleEnded()}
      />

      {expanded && (
        <div className="player-bar-expanded-panel">
          <div className="player-bar-expanded-header">
            <button
              type="button"
              className="player-bar-expanded-title player-bar-song-title"
              onClick={() => { setExpanded(false); if (currentSongId) openDrawer(currentSongId) }}
              title="Open song"
            >
              {song.title}
            </button>
            <button type="button" className="player-bar-expand-close" onClick={() => setExpanded(false)}>
              Close
            </button>
          </div>
          <InteractiveWaveform
            audioUrl={audioUrl}
            progress={progress}
            active={isPlaying}
            barCount={180}
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
            className={`song-card-play h-9 w-9 text-xs${buffering ? ' player-bar-buffering' : ''}`}
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

        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="player-bar-song-title truncate text-sm font-semibold"
            onClick={() => currentSongId && openDrawer(currentSongId)}
            title="Open song"
          >
            {song.title}
          </button>
          <div className="truncate font-mono text-[0.65rem] text-muted">
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
                {' '}
                · {playlistSource === 'favourites' ? '★ ' : ''}
                {currentIndex + 1}/{playlist.length}
              </button>
            )}
          </div>
          <div
            className="player-bar-wave-hit"
            onClick={() => setExpanded(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setExpanded(true)
            }}
            role="button"
            tabIndex={0}
            aria-label="Open waveform"
          >
            <InteractiveWaveform
              audioUrl={audioUrl}
              progress={progress}
              active={isPlaying && !buffering}
              barCount={32}
              height={24}
              className="mt-1.5"
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
        </div>

        <PlayerLoopButton />
        <SpeedControl value={playbackRate} onChange={setPlaybackRate} className="player-bar-speed" />
      </div>
      <PlayerQueueDrawer />
    </footer>
  )
}
