import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveWaveform } from '@/components/audio/InteractiveWaveform'
import { ShareCommentThread } from '@/components/share/ShareCommentThread'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { formatDuration } from '@/lib/audio-utils'
import type { PlaybackRate } from '@/lib/constants'
import {
  addShareListenComment,
  downloadSharedAudio,
  getSongShareListen,
  recordShareListen,
  recordShareView,
  type ShareListenComment,
} from '@/db/repositories/shareRepo'
import { supabaseConfigured } from '@/lib/supabase/client'
import '@/styles/share.css'

const AUTHOR_KEY = 'memo-share-author'

export function SharePage() {
  const { token } = useParams<{ token: string }>()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const savedPasswordRef = useRef<string | undefined>(undefined)
  const listenRecordedRef = useRef(false)
  const viewRecordedRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [durationMs, setDurationMs] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [allowDownload, setAllowDownload] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [comments, setComments] = useState<ShareListenComment[]>([])
  const [authorName, setAuthorName] = useState(() => localStorage.getItem(AUTHOR_KEY) ?? '')
  const [draftBody, setDraftBody] = useState('')
  const [pinMs, setPinMs] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1)

  const recordListen = () => {
    if (!token || listenRecordedRef.current) return
    listenRecordedRef.current = true
    void recordShareListen(token).catch(() => {
      listenRecordedRef.current = false
    })
  }

  const loadShare = async (pwd?: string) => {
    if (!token) return
    setLoading(true)
    setError(null)
    listenRecordedRef.current = false
    viewRecordedRef.current = false

    try {
      const payload = await getSongShareListen(token, pwd)
      setTitle(payload.song_title)
      setVersionLabel(payload.version_label)
      setDurationMs(payload.duration_ms)
      setAllowDownload(payload.allow_download)
      setComments(payload.comments ?? [])
      setNeedsPassword(false)
      if (pwd) savedPasswordRef.current = pwd

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      const blob = await downloadSharedAudio(payload.storage_path)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setAudioUrl(url)

      if (!viewRecordedRef.current) {
        viewRecordedRef.current = true
        void recordShareView(token).catch(() => {
          viewRecordedRef.current = false
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load share'
      if (message.toLowerCase().includes('password')) {
        setNeedsPassword(true)
        setError(null)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadShare()
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [token])

  useEffect(() => {
    if (authorName.trim()) localStorage.setItem(AUTHOR_KEY, authorName.trim())
  }, [authorName])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = playbackRate
  }, [playbackRate, audioUrl])

  const seekTo = (fraction: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = fraction * audio.duration
    setProgress(fraction)
    setCurrentMs(audio.currentTime * 1000)
  }

  const seekToMs = (ms: number) => {
    if (!durationMs) return
    seekTo(ms / durationMs)
  }

  const download = () => {
    if (!audioUrl || !allowDownload) return
    const anchor = document.createElement('a')
    anchor.href = audioUrl
    anchor.download = `${title || 'demo'}.m4a`
    anchor.click()
  }

  const postComment = async () => {
    if (!token || !draftBody.trim()) return
    setSubmitting(true)
    try {
      const atMs = pinMs ?? currentMs
      await addShareListenComment(token, {
        password: savedPasswordRef.current,
        timestampMs: atMs,
        body: draftBody,
        authorName: authorName.trim() || 'Guest',
      })
      setDraftBody('')
      setPinMs(null)
      await loadShare(savedPasswordRef.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const commentMarkers = useMemo(
    () =>
      durationMs > 0
        ? comments.map((comment) => ({
            id: comment.id,
            progress: comment.timestamp_ms / durationMs,
          }))
        : [],
    [comments, durationMs],
  )

  if (!supabaseConfigured) {
    return (
      <div className="share-page">
        <p>Share links are not configured on this deployment.</p>
      </div>
    )
  }

  return (
    <div className="share-page">
      <header className="share-header">
        <Link to="/" className="share-logo">
          mem<span>•</span>
        </Link>
        <span className="share-badge">Demo listen</span>
      </header>

      <main className="share-main">
        {loading && <p className="share-muted">Loading demo…</p>}

        {needsPassword && !loading && (
          <div className="share-password-card">
            <h1>Password required</h1>
            <p className="share-muted">Enter the password shared with you.</p>
            <input
              type="password"
              className="share-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadShare(password)
              }}
            />
            <button type="button" className="share-primary" onClick={() => void loadShare(password)}>
              Listen
            </button>
          </div>
        )}

        {error && <p className="share-error">{error}</p>}

        {!loading && !needsPassword && !error && audioUrl && (
          <div className="share-player-card">
            <h1 className="share-title">{title}</h1>
            <p className="share-version">{versionLabel}</p>

            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => {
                setIsPlaying(true)
                recordListen()
              }}
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
            />

            <div className="share-transport">
              <button
                type="button"
                className="share-play"
                onClick={() => {
                  const audio = audioRef.current
                  if (!audio) return
                  if (isPlaying) audio.pause()
                  else {
                    void audio.play().then(() => recordListen())
                  }
                }}
              >
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <span className="share-time">
                {formatDuration(currentMs)} / {formatDuration(durationMs)}
              </span>
              <SpeedControl
                value={playbackRate}
                onChange={(rate) => {
                  setPlaybackRate(rate)
                  const audio = audioRef.current
                  if (audio) audio.playbackRate = rate
                }}
              />
              {allowDownload && (
                <button type="button" className="share-download" onClick={download}>
                  Download
                </button>
              )}
            </div>

            <InteractiveWaveform
              audioUrl={audioUrl}
              progress={progress}
              active={isPlaying}
              barCount={120}
              height={96}
              className="share-waveform"
              markers={commentMarkers}
              onSeek={seekTo}
              onMarkerClick={(id) => {
                const comment = comments.find((row) => row.id === id)
                if (comment) seekToMs(comment.timestamp_ms)
              }}
            />

            <ShareCommentThread
              comments={comments}
              currentMs={currentMs}
              authorName={authorName}
              onAuthorNameChange={setAuthorName}
              draftBody={draftBody}
              onDraftBodyChange={setDraftBody}
              pinMs={pinMs}
              onPinAtCurrent={() => setPinMs(currentMs)}
              onClearPin={() => setPinMs(null)}
              onSubmit={postComment}
              submitting={submitting}
              onSeek={seekToMs}
            />
          </div>
        )}
      </main>
    </div>
  )
}
