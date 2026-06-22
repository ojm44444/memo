import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveWaveform } from '@/components/audio/InteractiveWaveform'
import { formatDuration } from '@/lib/audio-utils'
import {
  downloadPlaylistAudio,
  getPlaylistShareListen,
  type PlaylistShareSong,
} from '@/db/repositories/playlistShareRepo'
import { supabaseConfigured } from '@/lib/supabase/client'
import '@/styles/share.css'
import '@/styles/playlist-share.css'

type TrackState = {
  song: PlaylistShareSong
  objectUrl: string | null
  loading: boolean
  error: string | null
}

export function PlaylistSharePage() {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [tracks, setTracks] = useState<TrackState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    if (!token) return

    const load = async () => {
      try {
        const payload = await getPlaylistShareListen(token)
        setLabel(payload.label)
        setTracks(payload.songs.map((song) => ({ song, objectUrl: null, loading: false, error: null })))
        setLoading(false)

        // Load first track immediately, rest lazily
        for (let i = 0; i < payload.songs.length; i++) {
          const song = payload.songs[i]
          setTracks((prev) => prev.map((t, idx) => idx === i ? { ...t, loading: true } : t))
          try {
            const blob = await downloadPlaylistAudio(song.storage_path)
            const url = URL.createObjectURL(blob)
            objectUrlsRef.current[i] = url
            setTracks((prev) => prev.map((t, idx) => idx === i ? { ...t, objectUrl: url, loading: false } : t))
          } catch {
            setTracks((prev) => prev.map((t, idx) => idx === i ? { ...t, loading: false, error: 'Failed to load' } : t))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load playlist')
        setLoading(false)
      }
    }

    void load()

    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [token])

  // When currentIndex changes, load the audio element
  useEffect(() => {
    const audio = audioRef.current
    const track = tracks[currentIndex]
    if (!audio || !track?.objectUrl) return
    const wasPlaying = isPlaying
    audio.src = track.objectUrl
    audio.load()
    setProgress(0)
    setCurrentMs(0)
    setDurationMs(track.song.duration_ms)
    if (wasPlaying) void audio.play()
  }, [currentIndex, tracks.map((t) => t.objectUrl).join(',')])

  const playTrack = (index: number) => {
    if (index === currentIndex) {
      const audio = audioRef.current
      if (!audio) return
      if (isPlaying) audio.pause()
      else void audio.play()
      return
    }
    setCurrentIndex(index)
    setIsPlaying(false)
    setTimeout(() => {
      const audio = audioRef.current
      const track = tracks[index]
      if (audio && track?.objectUrl) {
        audio.src = track.objectUrl
        audio.load()
        void audio.play()
      }
    }, 50)
  }

  const seekTo = (fraction: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = fraction * audio.duration
    setProgress(fraction)
    setCurrentMs(audio.currentTime * 1000)
  }

  if (!supabaseConfigured) {
    return (
      <div className="share-page">
        <p className="share-muted" style={{ padding: '40px 20px' }}>Share links are not configured on this deployment.</p>
      </div>
    )
  }

  const currentTrack = tracks[currentIndex]

  return (
    <div className="share-page">
      <header className="share-header">
        <Link to="/" className="share-logo">mem<span>o</span></Link>
        <span className="share-badge">Playlist</span>
      </header>

      <main className="share-main" style={{ alignItems: 'flex-start' }}>
        {loading && <p className="share-muted" style={{ padding: '40px 20px' }}>Loading playlist…</p>}
        {error && <p className="share-error" style={{ padding: '40px 20px' }}>{error}</p>}

        {!loading && !error && (
          <div className="playlist-layout">
            {/* Sticky player for the active track */}
            <div className="playlist-player-card">
              {currentTrack && (
                <>
                  <p className="playlist-now-playing">Now playing</p>
                  <h1 className="share-title">{currentTrack.song.title}</h1>
                  <p className="share-version">{currentTrack.song.version_label}</p>

                  <audio
                    ref={audioRef}
                    src={currentTrack.objectUrl ?? undefined}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={(e) => {
                      const ms = e.currentTarget.duration * 1000
                      if (ms) setDurationMs(ms)
                    }}
                    onTimeUpdate={(e) => {
                      const el = e.currentTarget
                      if (!el.duration) return
                      setProgress(el.currentTime / el.duration)
                      setCurrentMs(el.currentTime * 1000)
                    }}
                    onEnded={() => {
                      if (currentIndex < tracks.length - 1) playTrack(currentIndex + 1)
                      else setIsPlaying(false)
                    }}
                  />

                  <div className="share-transport">
                    <button
                      type="button"
                      className="share-play"
                      onClick={() => playTrack(currentIndex)}
                      disabled={!currentTrack.objectUrl}
                    >
                      {isPlaying ? '❚❚' : '▶'}
                    </button>
                    <span className="share-time">
                      {formatDuration(currentMs)} / {formatDuration(durationMs || currentTrack.song.duration_ms)}
                    </span>
                    <button
                      type="button"
                      className="playlist-skip"
                      disabled={currentIndex >= tracks.length - 1}
                      onClick={() => playTrack(currentIndex + 1)}
                    >
                      ▶▶
                    </button>
                  </div>

                  <InteractiveWaveform
                    audioUrl={currentTrack.objectUrl ?? ''}
                    progress={progress}
                    active={isPlaying}
                    barCount={80}
                    height={72}
                    className="share-waveform"
                    markers={[]}
                    onSeek={seekTo}
                    onMarkerClick={() => {}}
                  />
                </>
              )}
              {label && <p className="playlist-label">{label}</p>}
            </div>

            {/* Track list */}
            <ul className="playlist-tracklist">
              {tracks.map((track, index) => (
                <li
                  key={track.song.song_id}
                  className={`playlist-track${index === currentIndex ? ' is-active' : ''}${track.loading ? ' is-loading' : ''}`}
                  onClick={() => { if (track.objectUrl) playTrack(index) }}
                >
                  <span className="playlist-track-index">{index + 1}</span>
                  <div className="playlist-track-meta">
                    <span className="playlist-track-title">{track.song.title}</span>
                    {track.song.version_label && (
                      <span className="playlist-track-label">{track.song.version_label}</span>
                    )}
                  </div>
                  <span className="playlist-track-dur">{formatDuration(track.song.duration_ms)}</span>
                  {track.loading && <span className="playlist-track-loading">…</span>}
                  {index === currentIndex && isPlaying && <span className="playlist-track-playing">♪</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
