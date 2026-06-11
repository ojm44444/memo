import { useEffect, useRef, useState } from 'react'
import {
  getPlaybackPositionMs,
  setPlaybackPositionMs,
} from '@/lib/audio/playbackPosition'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { SpeedControl } from './SpeedControl'
import { PlayerLoopButton } from './PlayerLoopButton'
import { PlayerQueueDrawer } from './PlayerQueueDrawer'
import { InteractiveWaveform } from './InteractiveWaveform'

export function ColumnPlayerBar() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const lastSavedMsRef = useRef(0)
  const resumeSeekRef = useRef<number | null>(null)
  const [sourceReady, setSourceReady] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)

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
  } = usePlayerStore()

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

    async function loadSource() {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      if (!version || !audioRef.current || !currentSongId) return

      if (pendingSeekMs != null) {
        resumeSeekRef.current = pendingSeekMs
        clearPendingSeek()
      } else if (currentSongId) {
        resumeSeekRef.current = await getPlaybackPositionMs(currentSongId)
      }

      const url = await resolvePlaybackUrl(version.localBlobId, version.storagePath)
      if (cancelled || !audioRef.current) return

      if (!url) {
        setPlaying(false)
        return
      }

      if (version.localBlobId) {
        objectUrlRef.current = url
      }

      audioRef.current.src = url
      setAudioUrl(url)
      setSourceReady(true)
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
    pendingSeekMs,
    clearPendingSeek,
    setPlaying,
  ])

  useEffect(() => {
    if (progress === 0 && audioRef.current && sourceReady) {
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
      void audio.play().catch(() => setPlaying(false))
    } else {
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
        ref={audioRef}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget
          setDurationMs(element.duration * 1000)

          const resumeMs = resumeSeekRef.current
          resumeSeekRef.current = null
          if (resumeMs && element.duration && resumeMs < element.duration * 0.92) {
            element.currentTime = resumeMs / 1000
            setProgress(resumeMs / (element.duration * 1000))
            setCurrentMs(resumeMs)
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
        }}
        onEnded={() => void handleEnded()}
      />

      {expanded && (
        <div className="player-bar-expanded-panel">
          <div className="player-bar-expanded-header">
            <span className="player-bar-expanded-title">{song.title}</span>
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
          <div className="player-bar-expanded-time">
            {formatDuration(currentMs)} / {formatDuration(durationMs || version?.durationMs)}
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
            onClick={() => setPlaying(!isPlaying)}
            className="song-card-play h-9 w-9 text-xs"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '❚❚' : '▶'}
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
          <div className="truncate text-sm font-semibold">{song.title}</div>
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
              active={isPlaying}
              barCount={32}
              height={24}
              className="mt-1.5"
              onSeek={seekTo}
            />
          </div>
        </div>

        <PlayerLoopButton />
        <SpeedControl value={playbackRate} onChange={setPlaybackRate} className="player-bar-speed" />
      </div>
      <PlayerQueueDrawer />
    </footer>
  )
}
