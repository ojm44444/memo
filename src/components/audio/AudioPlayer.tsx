import { useEffect, useRef } from 'react'
import { getAudioBlob } from '@/db/repositories/audioRepo'
import { db } from '@/db/database'
import { supabase } from '@/lib/supabase/client'
import { usePlayerStore } from '@/stores/playerStore'
import { SpeedControl } from './SpeedControl'
import { Waveform } from './Waveform'
import { formatDuration } from '@/lib/audio-utils'

interface AudioPlayerProps {
  versionId: string
  songTitle: string
  durationMs: number
  localBlobId: string | null
  storagePath: string | null
  active?: boolean
  onEnded?: () => void
}

export function AudioPlayer({
  versionId,
  songTitle,
  durationMs,
  localBlobId,
  storagePath,
  active = false,
  onEnded,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const {
    isPlaying,
    playbackRate,
    progress,
    currentVersionId,
    setPlaying,
    setProgress,
    setPlaybackRate,
  } = usePlayerStore()

  const isCurrent = currentVersionId === versionId
  const playing = isCurrent && isPlaying

  useEffect(() => {
    let cancelled = false

    async function loadSource() {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      if (localBlobId) {
        const record = await getAudioBlob(localBlobId)
        if (record && !cancelled) {
          objectUrlRef.current = URL.createObjectURL(record.blob)
          if (audioRef.current) audioRef.current.src = objectUrlRef.current
        }
        return
      }

      if (storagePath && supabase) {
        const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 3600)
        if (data?.signedUrl && !cancelled && audioRef.current) {
          audioRef.current.src = data.signedUrl
        }
      }
    }

    if (isCurrent) void loadSource()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [versionId, localBlobId, storagePath, isCurrent])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    if (!isCurrent || !audioRef.current) return
    if (playing) {
      void audioRef.current.play().catch(() => setPlaying(false))
    } else {
      audioRef.current.pause()
    }
  }, [playing, isCurrent, setPlaying])

  const togglePlay = () => {
    if (!isCurrent) return
    setPlaying(!playing)
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-audio-mint text-[0.6rem] text-bg"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{songTitle}</p>
        <Waveform progress={isCurrent ? progress : 0} active={active || isCurrent} />
      </div>

      <span className="shrink-0 font-mono text-[0.62rem] text-muted">
        {formatDuration(durationMs)}
      </span>

      {isCurrent && (
        <SpeedControl value={playbackRate} onChange={setPlaybackRate} />
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          if (el.duration) setProgress(el.currentTime / el.duration)
        }}
        onEnded={() => onEnded?.()}
      />
    </div>
  )
}

// Preload helper for column queue
export async function resolveAudioUrl(versionId: string): Promise<string | null> {
  const version = await db.audioVersions.get(versionId)
  if (!version) return null
  if (version.localBlobId) {
    const blob = await getAudioBlob(version.localBlobId)
    return blob ? URL.createObjectURL(blob.blob) : null
  }
  if (version.storagePath && supabase) {
    const { data } = await supabase.storage.from('audio').createSignedUrl(version.storagePath, 3600)
    return data?.signedUrl ?? null
  }
  return null
}
