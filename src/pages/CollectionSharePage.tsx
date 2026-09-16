import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveWaveform } from '@/components/audio/InteractiveWaveform'
import { ShareCommentThread } from '@/components/share/ShareCommentThread'
import { Wordmark } from '@/components/ui/Wordmark'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDuration } from '@/lib/audio-utils'
import { PLAYBACK_RATES } from '@/lib/constants'
import { supabaseConfigured } from '@/lib/supabase/client'
import {
  addCollectionComment,
  getCollectionShare,
  recordCollectionListen,
  signedTrackUrl,
  type CollectionComment,
  type CollectionPayload,
  type CollectionTrack,
} from '@/db/repositories/collectionShareRepo'
import '@/styles/share.css'
import '@/styles/collection-share.css'

const AUTHOR_KEY = 'memo-share-author'

/**
 * The page a label opens.
 *
 * It has one job: feel like being handed a record, not an attachment. So it
 * leads with the thing itself (art, title, who it is by, how long it is, one
 * Play button) and keeps everything else out of the way until a track is
 * playing. Comments sit under the track they are about, pinned to the second,
 * because "the snare at 1:12" is the note a mix engineer can act on and "love
 * track 3" is not.
 *
 * Tracks stream from a signed URL rather than downloading first. A master is
 * often a 60 MB WAV and the first bar should play in a second on a phone.
 *
 * Nothing here is a promise about security in words. The page simply only
 * works while the link is live: the storage rule checks the link on every file.
 */

type Row = { track: CollectionTrack; isVersion: boolean; number: number; versionIndex: number }

function hashSeed(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Generated artwork: the stage ramp, turned by the link, so no two look the same. */
function CollectionArt({ seed, title }: { seed: string; title: string }) {
  const h = hashSeed(seed)
  const angle = 110 + (h % 140)
  const bars = [0.46, 0.72, 0.58, 0.9].map((b, i) => Math.max(0.42, b - (((h >> (i * 4)) & 15) / 80)))
  return (
    <div
      className="coll-art"
      style={{ ['--coll-angle' as string]: `${angle}deg` }}
      role="img"
      aria-label={`Artwork for ${title}`}
    >
      <div className="coll-art-bars" aria-hidden>
        {bars.map((height, i) => (
          <span key={i} className={`coll-art-bar b${i + 1}`} style={{ height: `${Math.round(height * 100)}%` }} />
        ))}
      </div>
    </div>
  )
}

function kindLabel(track: CollectionTrack) {
  if (track.kind === 'master') return 'Master'
  if (track.kind === 'mix') return 'Mix'
  return 'Demo'
}

/** A take's label says something only when it is not just the song's name again. */
function extraLabel(track: CollectionTrack) {
  const label = track.version_label?.trim()
  if (!label || label.toLowerCase() === track.title.trim().toLowerCase()) return null
  return label
}

function fileExtension(path: string) {
  const match = path.match(/\.([a-z0-9]{2,5})$/i)
  return match ? `.${match[1].toLowerCase()}` : ''
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'track'
}

export function CollectionSharePage() {
  const { token } = useParams<{ token: string }>()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlCache = useRef(new Map<string, string>())
  const listenRecorded = useRef(false)
  const passwordRef = useRef<string | undefined>(undefined)

  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordWrong, setPasswordWrong] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CollectionPayload | null>(null)
  const [comments, setComments] = useState<CollectionComment[]>([])

  const [current, setCurrent] = useState<number | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [rate, setRate] = useState(1)

  const [authorName, setAuthorName] = useState(() => {
    try {
      return localStorage.getItem(AUTHOR_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [draftBody, setDraftBody] = useState('')
  const [pinMs, setPinMs] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const title = data?.title?.trim() || 'Untitled'
  usePageTitle(data ? `${title}${data.artist ? ` · ${data.artist}` : ''} · songdrafts` : 'songdrafts')

  const load = useCallback(
    async (password?: string) => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const payload = await getCollectionShare(token, password)
        passwordRef.current = password
        setData(payload)
        setComments(payload.comments ?? [])
        setNeedsPassword(false)
        setPasswordWrong(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (/password/i.test(message)) {
          setPasswordWrong(Boolean(password))
          setNeedsPassword(true)
        } else {
          setError(
            /not found|expired/i.test(message)
              ? 'This link has stopped working. Ask whoever sent it for a new one.'
              : 'Could not open this link. Check your connection and try again.',
          )
        }
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  useEffect(() => {
    try {
      if (authorName.trim()) localStorage.setItem(AUTHOR_KEY, authorName.trim())
    } catch {
      /* private mode: the name just is not remembered */
    }
  }, [authorName])

  const tracks = useMemo(() => data?.tracks ?? [], [data])

  /* Several versions of one song sit together, newest first: the first is the
     track, the rest hang under it as earlier versions rather than counting as
     more songs. */
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    tracks.forEach((track, i) => {
      const prev = out[i - 1]
      const isVersion = i > 0 && tracks[i - 1].song_id === track.song_id
      out.push({
        track,
        isVersion,
        number: isVersion ? prev.number : (prev?.number ?? 0) + 1,
        versionIndex: isVersion ? prev.versionIndex + 1 : 0,
      })
    })
    return out
  }, [tracks])

  const songCount = rows.filter((row) => !row.isVersion).length
  const totalMs = rows.filter((row) => !row.isVersion).reduce((sum, row) => sum + (row.track.duration_ms || 0), 0)
  const kinds = new Set(tracks.map((t) => t.kind))
  const eyebrow = kinds.size === 1 && kinds.has('master') ? 'Masters' : kinds.has('mix') || kinds.has('master') ? 'Mixes' : 'Demos'

  const playIndex = useCallback(
    async (index: number) => {
      const audio = audioRef.current
      const track = tracks[index]
      if (!audio || !track) return

      if (index === current && currentUrl) {
        if (audio.paused) void audio.play()
        else audio.pause()
        return
      }

      setCurrent(index)
      setProgress(0)
      setCurrentMs(0)
      setPinMs(null)
      setBuffering(true)
      try {
        let url = urlCache.current.get(track.version_id)
        if (!url) {
          url = await signedTrackUrl(track.storage_path)
          urlCache.current.set(track.version_id, url)
        }
        setCurrentUrl(url)
        audio.src = url
        audio.playbackRate = rate
        await audio.play()
        if (!listenRecorded.current && token) {
          listenRecorded.current = true
          void recordCollectionListen(token).catch(() => {
            listenRecorded.current = false
          })
        }
      } catch {
        setBuffering(false)
        setError('That track would not play. Try again, or try another browser.')
      }
    },
    [tracks, current, currentUrl, rate, token],
  )

  const togglePlay = () => {
    if (current === null) void playIndex(0)
    else void playIndex(current)
  }

  const next = () => {
    if (current === null) return
    const after = rows.findIndex((row, i) => i > current && !row.isVersion)
    if (after >= 0) void playIndex(after)
  }

  const previous = () => {
    const audio = audioRef.current
    if (current === null || !audio) return
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    let before = -1
    for (let i = current - 1; i >= 0; i--) {
      if (!rows[i].isVersion) {
        before = i
        break
      }
    }
    void playIndex(before >= 0 ? before : current)
  }

  const seekTo = (fraction: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = fraction * audio.duration
    setProgress(fraction)
    setCurrentMs(audio.currentTime * 1000)
  }

  const seekToMs = (ms: number) => {
    const track = current !== null ? tracks[current] : null
    const audio = audioRef.current
    const duration = audio?.duration ? audio.duration * 1000 : track?.duration_ms
    if (!duration) return
    seekTo(Math.min(1, ms / duration))
  }

  // Space to play and pause, unless someone is typing a comment.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /input|textarea/i.test(target.tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Lock screen and headphone controls on phones.
  useEffect(() => {
    if (!('mediaSession' in navigator) || current === null || !tracks[current]) return
    const track = tracks[current]
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: data?.artist ?? '',
      album: title,
    })
    navigator.mediaSession.setActionHandler('play', () => void audioRef.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause())
    navigator.mediaSession.setActionHandler('nexttrack', next)
    navigator.mediaSession.setActionHandler('previoustrack', previous)
  })

  const download = async (track: CollectionTrack, position: number) => {
    if (!data?.allow_download) return
    setDownloading(track.version_id)
    try {
      const label = extraLabel(track) ? ` (${extraLabel(track)})` : ''
      const name = `${String(position).padStart(2, '0')} ${safeName(track.title + label)}${fileExtension(track.storage_path)}`
      const url = await signedTrackUrl(track.storage_path, name)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.rel = 'noopener'
      anchor.click()
    } catch {
      setError('That download did not start. Try again.')
    } finally {
      setDownloading(null)
    }
  }

  const downloadAll = async () => {
    if (!data?.allow_download) return
    setDownloading('all')
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (const row of rows) {
        const label = extraLabel(row.track) ? ` (${extraLabel(row.track)})` : ''
        const prefix = row.isVersion ? `${String(row.number).padStart(2, '0')}.${row.versionIndex}` : String(row.number).padStart(2, '0')
        const url = await signedTrackUrl(row.track.storage_path)
        const blob = await (await fetch(url)).blob()
        zip.file(`${prefix} ${safeName(row.track.title + label)}${fileExtension(row.track.storage_path)}`, blob)
      }
      const archive = await zip.generateAsync({ type: 'blob' })
      const objectUrl = URL.createObjectURL(archive)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${safeName(`${data.artist ? `${data.artist} - ` : ''}${title}`)}.zip`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      setError('The download did not finish. Try the tracks one at a time.')
    } finally {
      setDownloading(null)
    }
  }

  const postComment = async () => {
    if (!token || current === null || !draftBody.trim()) return
    const track = tracks[current]
    setSubmitting(true)
    try {
      const atMs = pinMs ?? currentMs
      const author = authorName.trim() || 'Guest'
      await addCollectionComment(token, {
        password: passwordRef.current,
        versionId: track.version_id,
        timestampMs: atMs,
        body: draftBody,
        authorName: author,
      })
      setComments((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          version_id: track.version_id,
          timestamp_ms: Math.round(atMs),
          body: draftBody.trim(),
          author_name: author,
          created_at: new Date().toISOString(),
        },
      ])
      setDraftBody('')
      setPinMs(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That comment did not send.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className="coll-page">
        <p className="coll-state">Share links are not configured on this deployment.</p>
      </div>
    )
  }

  const currentTrack = current !== null ? tracks[current] : null
  const currentComments = currentTrack ? comments.filter((c) => c.version_id === currentTrack.version_id) : []
  const markers =
    currentTrack && currentTrack.duration_ms
      ? currentComments.map((c) => ({
          id: c.id,
          progress: Math.min(1, c.timestamp_ms / currentTrack.duration_ms),
          label: `${c.author_name}: ${c.body}`,
        }))
      : []

  return (
    <div className={`coll-page${currentTrack ? ' has-player' : ''}`}>
      <header className="coll-top">
        <Link to="/" className="coll-logo" aria-label="songdrafts">
          <Wordmark />
        </Link>
        <span className="coll-chip">Shared privately</span>
      </header>

      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          if (!el.duration) return
          setProgress(el.currentTime / el.duration)
          setCurrentMs(el.currentTime * 1000)
        }}
        onEnded={() => {
          setIsPlaying(false)
          next()
        }}
      />

      <main className="coll-main">
        {loading && <p className="coll-state">Opening…</p>}

        {!loading && needsPassword && (
          <form
            className="coll-lock"
            onSubmit={(e) => {
              e.preventDefault()
              void load(passwordDraft)
            }}
          >
            <h1 className="coll-lock-title">This one has a password.</h1>
            <p className="coll-muted">Whoever sent the link will have given it to you.</p>
            <input
              type="password"
              className="coll-input"
              value={passwordDraft}
              autoFocus
              onChange={(e) => setPasswordDraft(e.target.value)}
              aria-label="Password"
            />
            {passwordWrong && <p className="coll-error">That is not it. Try again.</p>}
            <button type="submit" className="coll-play-btn">
              Open
            </button>
          </form>
        )}

        {!loading && !needsPassword && !data && error && <p className="coll-state">{error}</p>}

        {!loading && data && (
          <>
            <section className="coll-hero">
              <CollectionArt seed={token ?? title} title={title} />
              <div className="coll-hero-text">
                <p className="coll-eyebrow">
                  {eyebrow} · {songCount} {songCount === 1 ? 'track' : 'tracks'} · {formatDuration(totalMs)}
                </p>
                <h1 className="coll-title">{title}</h1>
                {data.artist && <p className="coll-artist">{data.artist}</p>}
                <div className="coll-actions">
                  <button type="button" className="coll-play-btn" onClick={togglePlay} disabled={!tracks.length}>
                    {isPlaying ? 'Pause' : current === null ? 'Play' : 'Resume'}
                  </button>
                  {data.allow_download && tracks.length > 0 && (
                    <button
                      type="button"
                      className="coll-ghost-btn"
                      disabled={downloading !== null}
                      onClick={() => void downloadAll()}
                    >
                      {downloading === 'all' ? 'Preparing…' : 'Download all'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {error && <p className="coll-error coll-inline-error">{error}</p>}

            <ol className="coll-tracks">
              {rows.map((row, index) => {
                const { track } = row
                const active = index === current
                const trackComments = comments.filter((c) => c.version_id === track.version_id)
                return (
                  <li
                    key={`${track.version_id}-${index}`}
                    className={`coll-track${active ? ' is-active' : ''}${row.isVersion ? ' is-version' : ''}`}
                  >
                    <button
                      type="button"
                      className="coll-track-row"
                      onClick={() => void playIndex(index)}
                      aria-label={`${active && isPlaying ? 'Pause' : 'Play'} ${track.title}`}
                    >
                      <span className="coll-track-num" aria-hidden>
                        {active && isPlaying ? (
                          <span className="coll-eq">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : row.isVersion ? (
                          ''
                        ) : (
                          row.number
                        )}
                      </span>
                      <span className="coll-track-body">
                        <span className="coll-track-title">
                          {row.isVersion ? `Earlier version` : track.title}
                        </span>
                        <span className="coll-track-meta">
                          <span className={`coll-kind is-${track.kind ?? 'take'}`}>{kindLabel(track)}</span>
                          {extraLabel(track) && <span className="coll-track-label">{extraLabel(track)}</span>}
                          {trackComments.length > 0 && (
                            <span className="coll-track-notes">
                              {trackComments.length} {trackComments.length === 1 ? 'note' : 'notes'}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="coll-track-time">{formatDuration(track.duration_ms)}</span>
                    </button>

                    {active && (
                      <div className="coll-track-open">
                        <InteractiveWaveform
                          audioUrl={currentUrl}
                          cacheKey={track.version_id}
                          progress={progress}
                          active={isPlaying}
                          height={72}
                          className="coll-wave"
                          markers={markers}
                          onSeek={seekTo}
                          onMarkerClick={(id) => {
                            const c = currentComments.find((row) => row.id === id)
                            if (c) seekToMs(c.timestamp_ms)
                          }}
                        />
                        <div className="coll-track-tools">
                          <span className="coll-time">
                            {formatDuration(currentMs)} / {formatDuration(track.duration_ms)}
                          </span>
                          <div className="coll-rates" role="group" aria-label="Playback speed">
                            {PLAYBACK_RATES.map((r) => (
                              <button
                                key={r}
                                type="button"
                                className={r === rate ? 'is-on' : ''}
                                aria-pressed={r === rate}
                                onClick={() => {
                                  setRate(r)
                                  if (audioRef.current) audioRef.current.playbackRate = r
                                }}
                              >
                                {r}×
                              </button>
                            ))}
                          </div>
                          {data.allow_download && (
                            <button
                              type="button"
                              className="coll-link-btn"
                              disabled={downloading !== null}
                              onClick={() => void download(track, row.number)}
                            >
                              {downloading === track.version_id ? 'Starting…' : 'Download'}
                            </button>
                          )}
                        </div>
                        <ShareCommentThread
                          comments={currentComments}
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
                  </li>
                )
              })}
            </ol>

            {tracks.length === 0 && (
              <p className="coll-state">Nothing in here plays yet. Ask whoever sent it to check the link.</p>
            )}

            <p className="coll-foot">
              Shared from songdrafts
              {data.expires_at
                ? `. This link works until ${new Date(data.expires_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                  })}.`
                : '.'}
            </p>
          </>
        )}
      </main>

      {currentTrack && (
        <div className="coll-player" role="region" aria-label="Player">
          <div
            className="coll-player-progress"
            style={{ ['--coll-progress' as string]: `${progress * 100}%` }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seekTo((e.clientX - rect.left) / rect.width)
            }}
          />
          <div className="coll-player-inner">
            <div className="coll-player-now">
              <span className="coll-player-title">{currentTrack.title}</span>
              <span className="coll-player-sub">
                {kindLabel(currentTrack)}
                {data?.artist ? ` · ${data.artist}` : ''}
              </span>
            </div>
            <div className="coll-player-controls">
              <button type="button" className="coll-icon-btn" onClick={previous} aria-label="Previous">
                ⏮
              </button>
              <button
                type="button"
                className={`coll-player-play${buffering ? ' is-buffering' : ''}`}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {buffering ? '' : isPlaying ? '❚❚' : '▶'}
              </button>
              <button type="button" className="coll-icon-btn" onClick={next} aria-label="Next">
                ⏭
              </button>
            </div>
            <span className="coll-player-time">
              {formatDuration(currentMs)} / {formatDuration(currentTrack.duration_ms)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
