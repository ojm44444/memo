import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveWaveform } from '@/components/audio/InteractiveWaveform'
import { ShareCommentThread } from '@/components/share/ShareCommentThread'
import { RecordArt } from '@/components/share/RecordParts'
import { DownloadIcon, PauseIcon, PlayIcon } from '@/components/ui/Icons'
import { formatDuration } from '@/lib/audio-utils'
import { PLAYBACK_RATES, type PlaybackRate } from '@/lib/constants'
import {
  addShareListenComment,
  downloadSharedAudio,
  getSongShareListen,
  recordShareListen,
  recordShareView,
  type ShareListenComment,
} from '@/db/repositories/shareRepo'
import { supabaseConfigured } from '@/lib/supabase/client'
import { stageColorVar } from '@/lib/stageColor'
import '@/styles/share.css'
import '@/styles/record.css'
import '@/styles/collection-share.css'
import { Wordmark } from '@/components/ui/Wordmark'
import { usePageTitle } from '@/hooks/usePageTitle'

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
  /* The tab said "songdrafts · Finish more songs" on every shared link, so a
     producer with three of them open had three identical tabs, and history
     could not tell one song from another. Per-song titles already landed on
     the app; this is the one page a stranger sees, so it matters more here. */
  usePageTitle(title ? `${title} · songdrafts` : 'songdrafts')
  const [columnSlug, setColumnSlug] = useState<string | null>(null)
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
      setColumnSlug((payload as { column_slug?: string }).column_slug ?? null)
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
      const author = authorName.trim() || 'Guest'
      await addShareListenComment(token, {
        password: savedPasswordRef.current,
        timestampMs: atMs,
        body: draftBody,
        authorName: author,
      })
      setDraftBody('')
      setPinMs(null)
      await loadShare(savedPasswordRef.current)

      /* Tell the owner. Only the token goes up: the function reads the comment
         that was just saved from the database, so nothing typed here can be
         turned into email content. It used to send the whole comment, with a
         random id, and the function emailed whatever it was given. Failure
         is not the listener's problem, so it is not shown to them. */
      void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-share-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {})
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

  const extraLabel =
    versionLabel && versionLabel.trim().toLowerCase() !== title.trim().toLowerCase() ? versionLabel : null

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.pause()
    else void audio.play().then(() => recordListen())
  }

  return (
    <div className="coll-page">
      <header className="coll-top">
        <Link to="/" className="coll-logo" aria-label="songdrafts">
          <Wordmark />
        </Link>
        <span className="coll-chip">Shared privately</span>
      </header>

      {loading && <p className="coll-state">Opening…</p>}

      {needsPassword && !loading && (
        <form
          className="coll-lock"
          onSubmit={(e) => {
            e.preventDefault()
            void loadShare(password)
          }}
        >
          <h1 className="coll-lock-title">This one has a password.</h1>
          <p className="coll-muted">Whoever sent the link will have given it to you.</p>
          <input
            type="password"
            className="coll-input"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <button type="submit" className="rec-pill is-primary">
            Listen
          </button>
        </form>
      )}

      {error && !loading && (
        <p className="coll-state">
          {/not found|expired/i.test(error) ? 'This link has stopped working. Ask whoever sent it for a new one.' : error}
        </p>
      )}

      {!loading && !needsPassword && !error && audioUrl && (
        <main className="rec" style={{ ['--stage-ink' as string]: stageColorVar(columnSlug) }}>
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

          <section className="rec-hero">
            <RecordArt seed={token ?? title} label={`Cover for ${title}`} />
            <div>
              <p className="rec-eyebrow">
                One song · {formatDuration(durationMs)}
                {comments.length ? ` · ${comments.length} ${comments.length === 1 ? 'note' : 'notes'}` : ''}
              </p>
              <h1 className="rec-title">{title}</h1>
              {extraLabel && <p className="rec-artist">{extraLabel}</p>}
              <div className="rec-actions">
                <button type="button" className="rec-pill is-primary" onClick={togglePlay}>
                  {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <div className="rec-rates" role="group" aria-label="Playback speed">
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      className={rate === playbackRate ? 'is-on' : ''}
                      aria-pressed={rate === playbackRate}
                      onClick={() => {
                        setPlaybackRate(rate)
                        if (audioRef.current) audioRef.current.playbackRate = rate
                      }}
                    >
                      {rate}×
                    </button>
                  ))}
                </div>
                {allowDownload && (
                  <div className="rec-actions-end">
                    <button type="button" className="rec-circle" onClick={download} aria-label="Download" title="Download">
                      <DownloadIcon size={19} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rec-song-wave">
            <InteractiveWaveform
              audioUrl={audioUrl}
              progress={progress}
              active={isPlaying}
              height={88}
              className="rec-big-wave"
              markers={commentMarkers}
              onSeek={seekTo}
              onMarkerClick={(id) => {
                const comment = comments.find((row) => row.id === id)
                if (comment) seekToMs(comment.timestamp_ms)
              }}
            />
            <div className="rec-song-times">
              <span>{formatDuration(currentMs)}</span>
              <span>{formatDuration(durationMs)}</span>
            </div>
          </section>

          <section className="rec-song-notes">
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
          </section>

          <p className="coll-foot">Shared from songdrafts.</p>
        </main>
      )}
    </div>
  )
}
