import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveWaveform } from '@/components/audio/InteractiveWaveform'
import { ShareCommentThread } from '@/components/share/ShareCommentThread'
import { isSignedIn, rememberPendingLink, saveLink } from '@/db/repositories/savedLinksRepo'
import { RecordArt, RecordMenu } from '@/components/share/RecordParts'
import {
  CheckIcon,
  CommentIcon,
  DownloadIcon,
  EqIcon,
  MoreIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  StackIcon,
} from '@/components/ui/Icons'
import { Wordmark } from '@/components/ui/Wordmark'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDuration } from '@/lib/audio-utils'
import { HandoffScheduler, nextLeadMs, otherDeck, whenIdle, type HandoffReading } from '@/lib/audio/gapless'
import { unlockSpareElement } from '@/lib/audio/globalAudioEl'
import { supabaseConfigured } from '@/lib/supabase/client'
import {
  addCollectionComment,
  getCollectionShare,
  shareCoverUrl,
  shareDownloadUrl,
  type CollectionComment,
  type CollectionPayload,
  type CollectionTrack,
} from '@/db/repositories/collectionShareRepo'
import { LISTENER_NAME_KEY, recordShareListener } from '@/db/repositories/shareListenersRepo'
import { SHARE_URL_MARGIN_MS, ShareUrlCache } from '@/lib/share/shareAudio'
import '@/styles/record.css'
import '@/styles/collection-share.css'

const AUTHOR_KEY = LISTENER_NAME_KEY

/**
 * The page a label opens.
 *
 * Same shape as Listen in the app, on purpose: cover, title, who it is by,
 * Play and Shuffle, a quiet tracklist with notes, versions and length on the
 * right, and a player along the bottom with the waveform to scrub and the
 * notes pinned on it. Owen held this to Samply's standard on 16 Sept.
 *
 * Tracks stream from signed URLs (a master is often a 60 MB WAV). They come
 * from the share-audio function, which checks the link and password and signs
 * for ten minutes (security review, 19 Sept), so a revoked link stops within
 * minutes. URLs are asked for again as each track starts or is preloaded, and
 * once more if playback fails because one ran out mid-listen.
 */

type Song = { songId: string; versions: CollectionTrack[] }

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

/** The next track, loaded on the second element (see lib/audio/gapless.ts). */
interface PreparedTrack {
  songIndex: number
  versionId: string
  url: string
  el: HTMLAudioElement
}

export function CollectionSharePage() {
  const { token } = useParams<{ token: string }>()
  /* Gapless (18 Sept, Owen asked for true gapless playback): two <audio>
     elements. audioRef is the one playing; the other loads the next track and
     takes over a few milliseconds before this one ends. Handlers ignore
     whichever is not in charge. */
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const decksRef = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null])
  const preparedRef = useRef<PreparedTrack | null>(null)
  const leadMsRef = useRef(0)
  // What plays after the current track, kept fresh for the handoff timer.
  const upcomingRef = useRef<{ songIndex: number; versionId: string } | null>(null)
  const [handoffs, setHandoffs] = useState(0)
  const listenRecorded = useRef(false)
  const openRecorded = useRef(false)
  const passwordRef = useRef<string | undefined>(undefined)
  const urls = useMemo(
    () => new ShareUrlCache({ kind: 'collection', token: token ?? '' }),
    [token],
  )
  // URLs that already failed once and were re-requested: never loop on one.
  const recoveredRef = useRef(new Set<string>())

  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordWrong, setPasswordWrong] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CollectionPayload | null>(null)
  const [comments, setComments] = useState<CollectionComment[]>([])

  const [order, setOrder] = useState<number[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [currentSong, setCurrentSong] = useState<number | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [repeat, setRepeat] = useState(false)
  const [notesFor, setNotesFor] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  const [authorName, setAuthorName] = useState(() => {
    try {
      return localStorage.getItem(AUTHOR_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const nameRef = useRef(authorName)
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
        urls.setPassword(password)
        setData(payload)
        setComments(payload.comments ?? [])
        setNeedsPassword(false)
        setPasswordWrong(false)
        if (!openRecorded.current) {
          openRecorded.current = true
          void recordShareListener('collection', token, 'open', { name: nameRef.current, password }).catch(() => {
            openRecorded.current = false
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (/too many/i.test(message)) {
          setNeedsPassword(false)
          setError('Too many wrong passwords. Try again in an hour.')
        } else if (/password/i.test(message)) {
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
    [token, urls],
  )

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  useEffect(() => {
    const path = data?.cover_path
    if (!path || !token) return
    let live = true
    shareCoverUrl(token, passwordRef.current)
      .then((url) => live && url && setCoverUrl(url))
      .catch(() => {
        /* the generated art stays */
      })
    return () => {
      live = false
    }
  }, [data?.cover_path, token])

  useEffect(() => {
    nameRef.current = authorName
    try {
      if (authorName.trim()) localStorage.setItem(AUTHOR_KEY, authorName.trim())
    } catch {
      /* private mode */
    }
  }, [authorName])

  /* One row per song. Versions of the same song sit together in the link,
     newest first, and live behind the stack button rather than as extra rows. */
  const songs: Song[] = useMemo(() => {
    const out: Song[] = []
    for (const track of data?.tracks ?? []) {
      const last = out[out.length - 1]
      if (last && last.songId === track.song_id) last.versions.push(track)
      else out.push({ songId: track.song_id, versions: [track] })
    }
    return out
  }, [data])

  const playOrder = order ?? songs.map((_, i) => i)
  const trackFor = (index: number) => {
    const song = songs[index]
    return song.versions.find((v) => v.version_id === chosen[song.songId]) ?? song.versions[0]
  }

  const totalMs = songs.reduce((sum, _s, i) => sum + (trackFor(i).duration_ms || 0), 0)

  const attachDeck = useCallback((deck: 0 | 1, el: HTMLAudioElement | null) => {
    decksRef.current[deck] = el
    if (!audioRef.current || !decksRef.current.includes(audioRef.current)) {
      audioRef.current = decksRef.current[0] ?? decksRef.current[1] ?? null
    }
  }, [])
  const deckRefA = useCallback((el: HTMLAudioElement | null) => attachDeck(0, el), [attachDeck])
  const deckRefB = useCallback((el: HTMLAudioElement | null) => attachDeck(1, el), [attachDeck])

  const startTrack = useCallback(
    async (songIndex: number, track: CollectionTrack, atMs = 0) => {
      // Called inside the tap: let the second element play later without one.
      unlockSpareElement(otherDeck(decksRef.current, audioRef.current))
      const current = audioRef.current
      if (!current) return
      let audio: HTMLAudioElement = current
      setCurrentSong(songIndex)
      setProgress(0)
      setCurrentMs(atMs)
      setPinMs(null)
      setBuffering(true)
      try {
        const prepared = preparedRef.current
        const spare = otherDeck(decksRef.current, audio)
        // The preloaded element is only worth switching to while its URL can
        // still fetch the rest of the file; otherwise ask for a fresh one.
        const reusable =
          atMs === 0 &&
          prepared &&
          spare &&
          prepared.el === spare &&
          prepared.versionId === track.version_id &&
          !urls.isExpired(prepared.url, 60_000)
        const url = reusable ? prepared.url : await urls.get(track.storage_path)
        setCurrentUrl(url)
        if (reusable && prepared && spare) {
          // Already loaded on the other element (Next tapped, or the track
          // ended before the handoff timer ran): switch instead of reloading.
          preparedRef.current = null
          const from = audio
          audioRef.current = spare
          from.pause()
          audio = spare
          if (audio.currentTime > 0.05) audio.currentTime = 0
          if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) setBuffering(false)
        } else {
          audio.src = url
        }
        if (atMs > 0) {
          audio.addEventListener(
            'loadedmetadata',
            () => {
              audio.currentTime = atMs / 1000
            },
            { once: true },
          )
        }
        await audio.play()
        if (!listenRecorded.current && token) {
          listenRecorded.current = true
          void recordShareListener('collection', token, 'play', {
            name: nameRef.current,
            password: passwordRef.current,
          }).catch(() => {
            listenRecorded.current = false
          })
        }
      } catch (err) {
        setBuffering(false)
        setError(
          err instanceof Error && /not found|expired/i.test(err.message)
            ? 'This link has stopped working. Ask whoever sent it for a new one.'
            : 'That track would not play. Try again, or try another browser.',
        )
      }
    },
    [token, urls],
  )

  /* A URL lasts ten minutes. A long track, or a long pause, can outlive it:
     the next range request is refused and the element errors. Ask for a fresh
     URL and carry on from the same moment. Once per URL, so a link that has
     really been turned off ends here rather than looping. */
  const recoverExpired = async (el: HTMLAudioElement) => {
    const failed = el.currentSrc || el.src
    if (currentSong === null || !songs[currentSong] || !failed) return
    if (!urls.isExpired(failed, 60_000) || recoveredRef.current.has(failed)) return
    recoveredRef.current.add(failed)
    const track = trackFor(currentSong)
    const at = el.currentTime
    const wasPlaying = !el.paused
    setBuffering(true)
    try {
      const url = await urls.get(track.storage_path, { force: true })
      if (audioRef.current !== el) return
      setCurrentUrl(url)
      el.src = url
      if (at > 0) {
        el.addEventListener(
          'loadedmetadata',
          () => {
            el.currentTime = at
          },
          { once: true },
        )
      }
      if (wasPlaying) await el.play()
      else setBuffering(false)
    } catch (err) {
      setBuffering(false)
      setIsPlaying(false)
      setError(
        err instanceof Error && /not found|expired|password/i.test(err.message)
          ? 'This link has stopped working. Ask whoever sent it for a new one.'
          : 'That track would not play. Try again, or try another browser.',
      )
    }
  }

  const playSong = (songIndex: number) => {
    const audio = audioRef.current
    if (!audio) return
    if (songIndex === currentSong && currentUrl) {
      if (audio.paused) void audio.play()
      else audio.pause()
      return
    }
    void startTrack(songIndex, trackFor(songIndex))
  }

  const togglePlay = () => {
    if (currentSong === null) {
      if (playOrder.length) playSong(playOrder[0])
    } else playSong(currentSong)
  }

  /* Gapless (17 Sept, Owen asked for Samply's gapless playback; 18 Sept, true
     gapless). Once a track is past 60%, sign the next one's link and load it
     on the second element, so the change-over neither waits on the network
     nor on opening the file. Only the next track, and only once it is likely
     to be reached: every byte streamed here is paid for. */
  const upcomingIndex = (() => {
    if (currentSong === null) return undefined
    const at = playOrder.indexOf(currentSong)
    return playOrder[at + 1] ?? (repeat ? playOrder[0] : undefined)
  })()
  const upcomingVersionId =
    upcomingIndex !== undefined && songs[upcomingIndex] ? trackFor(upcomingIndex).version_id : null
  useEffect(() => {
    upcomingRef.current =
      upcomingIndex !== undefined && upcomingVersionId ? { songIndex: upcomingIndex, versionId: upcomingVersionId } : null
  }, [upcomingIndex, upcomingVersionId])

  const preparingRef = useRef<string | null>(null)
  const prepareNext = () => {
    if (upcomingIndex === undefined || !upcomingVersionId) return
    const spare = otherDeck(decksRef.current, audioRef.current)
    if (!spare) return
    const held = preparedRef.current
    if (
      held &&
      held.el === spare &&
      held.versionId === upcomingVersionId &&
      !urls.isExpired(held.url, SHARE_URL_MARGIN_MS)
    )
      return
    if (preparingRef.current === upcomingVersionId) return
    preparingRef.current = upcomingVersionId
    const track = trackFor(upcomingIndex)
    const songIndex = upcomingIndex
    void (async () => {
      try {
        // Fresh for at least a few more minutes, so the handoff lands in time.
        const url = await urls.get(track.storage_path)
        // The element that just handed over may still be finishing.
        await whenIdle(spare)
        if (spare === audioRef.current) return
        preparedRef.current = { songIndex, versionId: track.version_id, url, el: spare }
        spare.preload = 'auto'
        if (spare.src !== url) spare.src = url
      } catch {
        // Only a head start. The track still plays when its turn comes.
      } finally {
        if (preparingRef.current === track.version_id) preparingRef.current = null
      }
    })()
  }

  /* Start the next element a few milliseconds before this one runs out. */
  const readHandoff = useCallback((): HandoffReading | null => {
    const el = audioRef.current
    const prepared = preparedRef.current
    if (!el || !prepared || prepared.el === el) return null
    if (el.paused || !el.duration || !Number.isFinite(el.duration)) return null
    return { currentTimeSec: el.currentTime, endSec: el.duration, rate: el.playbackRate || 1, leadMs: leadMsRef.current }
  }, [])

  const handOff = useCallback(() => {
    const from = audioRef.current
    const prepared = preparedRef.current
    const upcoming = upcomingRef.current
    if (!from || !prepared || prepared.el === from || from.ended) return
    if (!upcoming || upcoming.songIndex !== prepared.songIndex || upcoming.versionId !== prepared.versionId) return
    const to = prepared.el
    preparedRef.current = null
    if (to.currentTime > 0.05) to.currentTime = 0
    // In charge before it starts, so the old one's pause and ended are ignored.
    audioRef.current = to
    const calledAt = performance.now()
    to.addEventListener(
      'playing',
      () => {
        leadMsRef.current = nextLeadMs(leadMsRef.current, performance.now() - calledAt)
      },
      { once: true },
    )
    void to.play().catch((err: Error) => {
      if (err?.name === 'AbortError' || audioRef.current !== to) return
      // Refused (never unlocked by a tap): play it on the element that was
      // just playing, as this page always did.
      audioRef.current = from
      from.src = prepared.url
      void from.play().catch(() => setIsPlaying(false))
    })
    setCurrentSong(prepared.songIndex)
    setCurrentUrl(prepared.url)
    setProgress(0)
    setCurrentMs(0)
    setPinMs(null)
    setBuffering(to.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
    setHandoffs((n) => n + 1)
  }, [])

  const schedulerRef = useRef<HandoffScheduler | null>(null)
  useEffect(() => {
    const scheduler = new HandoffScheduler(readHandoff, handOff)
    schedulerRef.current = scheduler
    return () => scheduler.cancel()
  }, [readHandoff, handOff])
  // Ready again for every new track (and every handoff: a one-track repeat
  // hands over to the same track).
  useEffect(() => {
    schedulerRef.current?.reset()
  }, [currentSong, currentUrl, handoffs])

  const step = (by: 1 | -1) => {
    if (currentSong === null) return
    const at = playOrder.indexOf(currentSong)
    const next = playOrder[at + by]
    if (next !== undefined) void startTrack(next, trackFor(next))
    else if (by === 1 && repeat && playOrder.length) void startTrack(playOrder[0], trackFor(playOrder[0]))
    else if (by === 1) setIsPlaying(false)
  }

  const previous = () => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    step(-1)
  }

  const shuffle = () => {
    const idx = songs.map((_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    setOrder(idx)
    if (idx.length) void startTrack(idx[0], trackFor(idx[0]))
  }

  const chooseVersion = (songIndex: number, track: CollectionTrack) => {
    const song = songs[songIndex]
    setChosen((prev) => ({ ...prev, [song.songId]: track.version_id }))
    if (currentSong === songIndex) {
      // A/B: land on the same moment of the other version.
      void startTrack(songIndex, track, Math.min(currentMs, Math.max(0, track.duration_ms - 250)))
    }
  }

  const seekTo = (fraction: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = fraction * audio.duration
    setProgress(fraction)
    setCurrentMs(audio.currentTime * 1000)
  }

  const seekToMs = (ms: number) => {
    const audio = audioRef.current
    const duration = audio?.duration ? audio.duration * 1000 : currentSong !== null ? trackFor(currentSong).duration_ms : 0
    if (duration) seekTo(Math.min(1, ms / duration))
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /input|textarea|select/i.test(target.tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!('mediaSession' in navigator) || currentSong === null || !songs[currentSong]) return
    const track = trackFor(currentSong)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: data?.artist ?? '',
      album: title,
      artwork: [{ src: '/brand/now-playing-square-512.png', sizes: '512x512', type: 'image/png' }],
    })
    navigator.mediaSession.setActionHandler('play', () => void audioRef.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause())
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1))
    navigator.mediaSession.setActionHandler('previoustrack', previous)
  })

  const download = async (track: CollectionTrack, position: number) => {
    if (!data?.allow_download) return
    setDownloading(track.version_id)
    try {
      const label = extraLabel(track) ? ` (${extraLabel(track)})` : ''
      const name = `${String(position).padStart(2, '0')} ${safeName(track.title + label)}${fileExtension(track.storage_path)}`
      const url = await shareDownloadUrl(token ?? '', track.storage_path, name, passwordRef.current)
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
      for (const [i, song] of songs.entries()) {
        for (const [vi, track] of song.versions.entries()) {
          const label = extraLabel(track) ? ` (${extraLabel(track)})` : ''
          const prefix = `${String(i + 1).padStart(2, '0')}${vi ? `.${vi}` : ''}`
          const url = await urls.get(track.storage_path)
          const blob = await (await fetch(url)).blob()
          zip.file(`${prefix} ${safeName(track.title + label)}${fileExtension(track.storage_path)}`, blob)
        }
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
    if (!token || currentSong === null || !draftBody.trim()) return
    const track = trackFor(currentSong)
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

  const currentTrack = currentSong !== null ? trackFor(currentSong) : null
  const currentComments = currentTrack ? comments.filter((c) => c.version_id === currentTrack.version_id) : []
  const markers =
    currentTrack && currentTrack.duration_ms
      ? currentComments.map((c) => ({
          id: c.id,
          progress: Math.min(1, c.timestamp_ms / currentTrack.duration_ms),
          label: `${c.author_name}: ${c.body}`,
        }))
      : []

  const openNotes = (songIndex: number) => {
    const song = songs[songIndex]
    setNotesFor((prev) => (prev === song.songId ? null : song.songId))
    if (currentSong !== songIndex) void startTrack(songIndex, trackFor(songIndex))
  }

  return (
    <div className={`coll-page${currentTrack ? ' has-player' : ''}`}>
      <header className="coll-top">
        <Link to="/" className="coll-logo" aria-label="songdrafts">
          <Wordmark />
        </Link>
        <span className="coll-chip">Shared privately</span>
      </header>

      {[0, 1].map((deck) => (
        <audio
          key={deck}
          ref={deck === 0 ? deckRefA : deckRefB}
          preload="metadata"
          onPlay={(e) => {
            if (e.currentTarget === audioRef.current) setIsPlaying(true)
          }}
          onPause={(e) => {
            if (e.currentTarget === audioRef.current) setIsPlaying(false)
          }}
          onWaiting={(e) => {
            if (e.currentTarget === audioRef.current) setBuffering(true)
          }}
          onPlaying={(e) => {
            if (e.currentTarget === audioRef.current) setBuffering(false)
          }}
          onCanPlay={(e) => {
            if (e.currentTarget === audioRef.current) setBuffering(false)
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget
            if (el !== audioRef.current || !el.duration) return
            setProgress(el.currentTime / el.duration)
            setCurrentMs(el.currentTime * 1000)
            if (el.currentTime / el.duration > 0.6) prepareNext()
            schedulerRef.current?.poke()
          }}
          onSeeked={(e) => {
            if (e.currentTarget === audioRef.current) schedulerRef.current?.poke()
          }}
          onEnded={(e) => {
            if (e.currentTarget === audioRef.current) step(1)
          }}
          onError={(e) => {
            const el = e.currentTarget
            if (el !== audioRef.current) {
              // The preloaded next track failed: let its turn load it afresh.
              if (preparedRef.current?.el === el) preparedRef.current = null
              return
            }
            void recoverExpired(el)
          }}
        />
      ))}

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
          <button type="submit" className="rec-pill is-primary">
            Open
          </button>
        </form>
      )}

      {!loading && !needsPassword && !data && error && <p className="coll-state">{error}</p>}

      {!loading && data && (
        <main className="rec">
          <section className="rec-hero">
            <RecordArt seed={token ?? title} label={`Cover for ${title}`} src={coverUrl} />
            <div>
              <p className="rec-eyebrow">
                {songs.length} {songs.length === 1 ? 'track' : 'tracks'} · {formatDuration(totalMs)}
              </p>
              <h1 className="rec-title">{title}</h1>
              {data.artist && <p className="rec-artist">{data.artist}</p>}
              {(data.pending_count ?? 0) > 0 && (
                <p className="rec-status coll-pending">
                  <span className="rec-status-dot" aria-hidden />
                  {data.pending_count} more {data.pending_count === 1 ? 'track is' : 'tracks are'} on the way. Refresh in a
                  few minutes.
                </p>
              )}
              <div className="rec-actions">
                <button type="button" className="rec-pill is-primary" onClick={togglePlay} disabled={!songs.length}>
                  {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button type="button" className="rec-pill is-quiet" onClick={shuffle} disabled={songs.length < 2}>
                  <ShuffleIcon size={17} />
                  Shuffle
                </button>
                <SaveToSongdrafts
                  link={{ token: token ?? '', title: data.title, artist: data.artist, cover_path: data.cover_path }}
                />
                {data.allow_download && songs.length > 0 && (
                  <div className="rec-actions-end">
                    <button
                      type="button"
                      className="rec-circle"
                      disabled={downloading !== null}
                      onClick={() => void downloadAll()}
                      aria-label="Download all"
                      title={downloading === 'all' ? 'Preparing the zip…' : 'Download all'}
                    >
                      <DownloadIcon size={19} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {error && <p className="coll-error coll-inline-error">{error}</p>}

          <ol className="rec-list">
            {songs.map((song, index) => {
              const track = trackFor(index)
              const isCurrent = index === currentSong
              const noteCount = comments.filter((c) => song.versions.some((v) => v.version_id === c.version_id)).length
              const notesOpen = notesFor === song.songId
              return (
                <li key={song.songId} className={`rec-row${isCurrent ? ' is-current' : ''}`}>
                  <div
                    className="rec-line"
                    role="button"
                    tabIndex={0}
                    aria-label={`${isCurrent && isPlaying ? 'Pause' : 'Play'} ${track.title}`}
                    onClick={() => playSong(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') playSong(index)
                    }}
                  >
                    <span className="rec-num">
                      {isCurrent ? (
                        <EqIcon className={isPlaying ? undefined : 'is-paused'} />
                      ) : (
                        <>
                          <span className="rec-num-index">{index + 1}</span>
                          <span className="rec-num-play">
                            <PlayIcon size={14} />
                          </span>
                        </>
                      )}
                    </span>

                    <span className="rec-name">
                      <span className="rec-name-title">{track.title}</span>
                      {/* 23 Sept, Owen: producers see this link, and "Mix"/"Demo"
                          read as a judgement he never asked to make. Nothing by
                          default; his own take label (already editable on the
                          song) shows here instead, if he set one. */}
                      {extraLabel(track) && <span className="rec-name-kind">{extraLabel(track)}</span>}
                    </span>

                    <span className="rec-right" onClick={(e) => e.stopPropagation()}>
                      {isCurrent ? (
                        <button type="button" className="rec-comment-pill" aria-expanded={notesOpen} onClick={() => openNotes(index)}>
                          <CommentIcon size={16} />
                          {noteCount ? `${noteCount}` : 'Comment'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`rec-stat${noteCount ? '' : ' is-empty'}`}
                          aria-expanded={notesOpen}
                          aria-label={`Notes on ${track.title}`}
                          onClick={() => openNotes(index)}
                        >
                          <CommentIcon size={17} />
                          {noteCount ? <span>{noteCount}</span> : null}
                        </button>
                      )}

                      {song.versions.length > 1 ? (
                        <RecordMenu
                          label={`Versions of ${track.title}`}
                          trigger={({ open, toggle }) => (
                            <button type="button" className="rec-stat" aria-expanded={open} onClick={toggle}>
                              <StackIcon size={17} />
                              <span>v{song.versions.length - song.versions.indexOf(track)}</span>
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <p className="rec-menu-title">Versions</p>
                              {song.versions.map((v, vi) => (
                                <button
                                  key={v.version_id}
                                  type="button"
                                  role="menuitem"
                                  className="rec-menu-item"
                                  onClick={() => {
                                    close()
                                    chooseVersion(index, v)
                                  }}
                                >
                                  <span>{v.version_id === track.version_id ? <CheckIcon size={16} /> : null}</span>
                                  <span>
                                    v{song.versions.length - vi}
                                    {extraLabel(v) && <small>{extraLabel(v)}</small>}
                                  </span>
                                  <span className="rec-menu-meta">{formatDuration(v.duration_ms)}</span>
                                </button>
                              ))}
                            </>
                          )}
                        </RecordMenu>
                      ) : (
                        <span className="rec-stat is-static" aria-hidden>
                          <StackIcon size={17} />
                          <span>v1</span>
                        </span>
                      )}

                      <span className="rec-dur">{formatDuration(track.duration_ms)}</span>

                      {data.allow_download ? (
                        <RecordMenu
                          label={`More for ${track.title}`}
                          trigger={({ open, toggle }) => (
                            <button type="button" className="rec-more" aria-expanded={open} aria-label="More" onClick={toggle}>
                              <MoreIcon size={18} />
                            </button>
                          )}
                        >
                          {(close) => (
                            <button
                              type="button"
                              role="menuitem"
                              className="rec-menu-item"
                              disabled={downloading !== null}
                              onClick={() => {
                                close()
                                void download(track, index + 1)
                              }}
                            >
                              <DownloadIcon size={16} />
                              <span>Download this version</span>
                              <span />
                            </button>
                          )}
                        </RecordMenu>
                      ) : (
                        <span className="rec-more-spacer" aria-hidden />
                      )}
                    </span>
                  </div>

                  {notesOpen && isCurrent && (
                    <div className="rec-panel">
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

          {songs.length === 0 && <p className="coll-state">Nothing in here plays yet. Ask whoever sent it to check the link.</p>}

          <p className="coll-foot">
            Shared from songdrafts
            {data.expires_at
              ? `. This link works until ${new Date(data.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`
              : '.'}
          </p>
        </main>
      )}

      {currentTrack && data && (
        <div className="rec-player" role="region" aria-label="Player">
          <div className="rec-player-now">
            <RecordArt seed={token ?? title} label="" src={coverUrl} />
            <div className="rec-player-text">
              <span className="rec-player-eyebrow">{title}</span>
              <span className="rec-player-title">{currentTrack.title}</span>
            </div>
          </div>

          <div className="rec-player-transport">
            <button type="button" className="rec-player-btn is-optional" onClick={previous} aria-label="Previous">
              <PrevIcon size={20} />
            </button>
            <button
              type="button"
              className="rec-player-btn is-main"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {buffering ? <span className="rec-spinner" /> : isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </button>
            <button type="button" className="rec-player-btn" onClick={() => step(1)} aria-label="Next">
              <NextIcon size={20} />
            </button>
            <button
              type="button"
              className={`rec-player-btn is-optional${repeat ? ' is-on' : ''}`}
              onClick={() => setRepeat((v) => !v)}
              aria-pressed={repeat}
              aria-label="Repeat"
            >
              <RepeatIcon size={18} />
            </button>
          </div>

          <div className="rec-player-scrub">
            <span className="rec-player-time">{formatDuration(currentMs)}</span>
            <InteractiveWaveform
              audioUrl={currentUrl}
              cacheKey={currentTrack.version_id}
              progress={progress}
              active={isPlaying}
              height={34}
              className="rec-player-wave"
              markers={markers}
              onSeek={seekTo}
              onMarkerClick={(id) => {
                const c = currentComments.find((row) => row.id === id)
                if (c) seekToMs(c.timestamp_ms)
              }}
            />
            <span className="rec-player-time">{formatDuration(currentTrack.duration_ms)}</span>
          </div>

          <div className="rec-player-extra">
            <button
              type="button"
              className={`rec-player-btn${currentSong !== null && notesFor === songs[currentSong]?.songId ? ' is-on' : ''}`}
              onClick={() => currentSong !== null && openNotes(currentSong)}
              aria-label="Comment at this moment"
              title="Comment at this moment"
            >
              <CommentIcon size={19} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Keep this playlist in your own songdrafts (signed in), or sign up and keep it. */
function SaveToSongdrafts({
  link,
}: {
  link: { token: string; title: string | null; artist: string | null; cover_path: string | null }
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  if (!link.token) return null
  return (
    <button
      type="button"
      className="rec-pill is-quiet"
      disabled={state === 'saving' || state === 'saved'}
      onClick={() => {
        void (async () => {
          if (!(await isSignedIn())) {
            rememberPendingLink(link)
            window.location.assign('/sign-up')
            return
          }
          setState('saving')
          try {
            await saveLink(link)
            setState('saved')
          } catch {
            setState('error')
          }
        })()
      }}
    >
      {state === 'saved' ? 'Saved to your Listen' : state === 'error' ? 'Try again' : 'Save to my songdrafts'}
    </button>
  )
}
