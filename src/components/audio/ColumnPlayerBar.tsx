import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getPlaybackPositionMs,
  setPlaybackPositionMs,
} from '@/lib/audio/playbackPosition'
import {
  registerAudioEl,
  registerSpareAudioEl,
  swapActiveAudioEl,
  consumeSrcSwitchPending,
  markSrcSwitch,
  markRealSrcSet,
  isRealAudioSrc,
} from '@/lib/audio/globalAudioEl'
import { HandoffScheduler, nextLeadMs, otherDeck, whenIdle, type HandoffReading } from '@/lib/audio/gapless'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { presignPlaybackUrls, resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { peekNextAtEnd, usePlayerStore } from '@/stores/playerStore'
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

/** Where a take starts: its trim-start always wins, then a saved position. */
function startPositionMs(trimStartMs: number | null | undefined, savedMs: number) {
  if ((trimStartMs ?? 0) > 0) return trimStartMs!
  return savedMs > 0 ? savedMs : 0
}

/**
 * The next track, loaded on the second element and waiting for its moment.
 * See gapless.ts for why there are two elements.
 */
interface PreparedNext {
  index: number
  versionId: string
  url: string
  startMs: number
  el: HTMLAudioElement
}

function setRateOnAll(elements: ReadonlyArray<HTMLMediaElement | null>, rate: number) {
  for (const el of elements) if (el) el.playbackRate = rate
}

/** How much of the file the element holds, 0 to 1, or null before the length is known. */
function bufferedFraction(el: HTMLMediaElement): number | null {
  if (!el.duration || !Number.isFinite(el.duration) || el.buffered.length === 0) return null
  return el.buffered.end(el.buffered.length - 1) / el.duration
}

export function ColumnPlayerBar() {
  /**
   * The element playing right now. There are two <audio> elements (the
   * gapless pair); this always points at the one in charge, and every event
   * handler below ignores the other one, which is only ever loading the next
   * track or finishing the last few milliseconds of the previous one.
   */
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const decksRef = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null])
  const preparedRef = useRef<PreparedNext | null>(null)
  // Start latency of an already-loaded element, learned from each handoff.
  const leadMsRef = useRef(0)
  // The take a handoff started, and when. For a moment afterwards the store's
  // progress=0 and the reload of the same take must not seek it back to the
  // start or show "Loading" (it is already a few milliseconds in and playing).
  const handedOffRef = useRef<{ versionId: string; at: number } | null>(null)
  const isFreshHandoff = (versionId: string | null | undefined) => {
    const handed = handedOffRef.current
    return Boolean(versionId && handed && handed.versionId === versionId && performance.now() - handed.at < 2000)
  }
  // Bumped at every handoff so the preload effect runs again for the track after.
  const [deckGen, setDeckGen] = useState(0)
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
    loopMode,
    queueRepeat,
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

  /* One ref callback per element, stable so React does not detach and
     reattach them on every render. The first element starts in charge. */
  const attachDeck = useCallback((deck: 0 | 1, el: HTMLAudioElement | null) => {
    decksRef.current[deck] = el
    if (!audioRef.current || !decksRef.current.includes(audioRef.current)) {
      audioRef.current = decksRef.current[0] ?? decksRef.current[1] ?? null
    }
    registerAudioEl(audioRef.current)
    registerSpareAudioEl(otherDeck(decksRef.current, audioRef.current))
  }, [])
  const deckRefA = useCallback((el: HTMLAudioElement | null) => attachDeck(0, el), [attachDeck])
  const deckRefB = useCallback((el: HTMLAudioElement | null) => attachDeck(1, el), [attachDeck])

  /** Put `el` in charge: the handlers, the tap paths and the store follow it from here. */
  const makeActive = useCallback((el: HTMLAudioElement) => {
    audioRef.current = el
    swapActiveAudioEl(el)
    registerSpareAudioEl(otherDeck(decksRef.current, el))
    el.playbackRate = usePlayerStore.getState().playbackRate
    el.volume = 1
    // Its own loadedmetadata/canplay were ignored while it was the spare.
    // Mark it real now so the unlock never takes it.
    markRealSrcSet()
  }, [])

  /** Show what the newly active element already knows: length, position, buffer. */
  const showDeck = useCallback((el: HTMLAudioElement) => {
    if (el.duration && Number.isFinite(el.duration)) setDurationMs(el.duration * 1000)
    setCurrentMs(el.currentTime * 1000)
    setBufferProgress(bufferedFraction(el) ?? 0)
  }, [])

  /* A handed-over element refused to start (iOS: it never had its tap). Do
     what the player always did: load the take on the element that was just
     playing, which is allowed to carry on. */
  const fallBackTo = useCallback(
    (from: HTMLAudioElement, url: string, startSec: number) => {
      // In charge first, so the pause its source change fires is read as a switch.
      markSrcSwitch()
      makeActive(from)
      from.src = url
      if (startSec > 0) {
        from.addEventListener('loadedmetadata', () => { from.currentTime = startSec }, { once: true })
      }
      void from.play().catch((err: Error) => {
        if (err?.name !== 'AbortError' && from === audioRef.current) setPlaying(false)
      })
    },
    [makeActive, setPlaying],
  )

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
      // A gapless handoff already has it playing: nothing to wait for.
      const handedOver = isFreshHandoff(version.id)
      if (fromCloud && !handedOver) useLoadProgress.getState().start(version.id)

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
      const effectiveStartMs = startPositionMs(version.trimStartMs, savedMs)
      resumeSeekRef.current = effectiveStartMs > 0 ? effectiveStartMs : null

      const sameUrl = audioRef.current.src === url && isRealAudioSrc(audioRef.current)
      const prepared = preparedRef.current
      const spare = otherDeck(decksRef.current, audioRef.current)
      let fallback: { from: HTMLAudioElement; startSec: number } | null = null
      if (
        !sameUrl &&
        seekMs == null &&
        prepared &&
        prepared.versionId === version.id &&
        prepared.url === url &&
        prepared.el === spare
      ) {
        /* The take is already loaded on the other element (Next tapped, or the
           track ended before the gapless timer ran, as in a hidden tab). Switch
           to it instead of loading the file again. */
        preparedRef.current = null
        const from = audioRef.current
        makeActive(spare)
        from.pause()
        resumeSeekRef.current = null
        const startSec = effectiveStartMs / 1000
        if (Math.abs(spare.currentTime - startSec) > 0.05) spare.currentTime = startSec
        fallback = { from, startSec }
        handedOffRef.current = { versionId: version.id, at: performance.now() }
        showDeck(spare)
        if (spare.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          setSourceReady(true)
          setBuffering(false)
          useLoadProgress.getState().done(version.id)
        }
      } else if (sameUrl) {
        // Handed over already playing from its start point: a resume seek
        // on its loadedmetadata would jump it.
        if (handedOver) resumeSeekRef.current = null
        setBufferProgress(bufferedFraction(audioRef.current) ?? 0)
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
        const playing = audioRef.current
        try {
          await playing.play()
        } catch (err) {
          if (
            !cancelled &&
            fallback &&
            playing === audioRef.current &&
            (err as Error)?.name === 'NotAllowedError'
          ) {
            fallBackTo(fallback.from, url, fallback.startSec)
            return
          }
          // Autoplay refused (no gesture, or the tab is backgrounded). Reflect
          // reality in the UI rather than showing a play state that is not real.
          // AbortError only means a newer source replaced this one mid-start.
          // A refusal on an element no longer in charge (a handoff fell back
          // to the other one) says nothing about what is playing now.
          if (!cancelled && playing === audioRef.current && (err as Error)?.name !== 'AbortError') setPlaying(false)
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
    makeActive,
    showDeck,
    fallBackTo,
  ])

  useEffect(() => {
    if (progress === 0 && audioRef.current && sourceReady) {
      // A handed-over take is already playing from where it should. Seeking
      // it to 0 here would restart it a moment after the join.
      if (isFreshHandoff(currentVersionId)) return
      if (skipProgressResetRef.current) {
        skipProgressResetRef.current = false
        return
      }
      audioRef.current.currentTime = 0
      setCurrentMs(0)
    }
  }, [progress, sourceReady, currentVersionId])

  // Both elements, so the next track starts at the chosen speed too.
  useEffect(() => {
    setRateOnAll(decksRef.current, playbackRate)
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
        if (err?.name !== 'AbortError' && audio === audioRef.current) setPlaying(false)
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

  /* GAPLESS, PART 1: load the next track on the other element while this one
     plays. A take on this device loads straight away (no network, no cost).
     A cloud take waits until this one is past 60% or in its last 45 seconds:
     audio egress is metered (see sync/audioDownload.ts), so the file is only
     fetched once it is likely to be heard. */
  const upcoming = peekNextAtEnd({ playlist, currentIndex, playlistSource, loopMode, queueRepeat })
  const upcomingIndex = upcoming?.index ?? -1
  const upcomingVersionId = upcoming?.item.audioVersionId ?? null
  const upcomingSongId = upcoming?.item.songId ?? null
  const nearEnd = progress >= 0.6 || (durationMs > 0 && durationMs - currentMs < 45_000)
  useEffect(() => {
    if (!sourceReady || !isPlaying || !upcomingVersionId || !upcomingSongId) return
    let live = true
    void (async () => {
      const next = await db.audioVersions.get(upcomingVersionId)
      if (!live || !next) return
      if (!next.localBlobId && !nearEnd) return
      const [url, savedMs] = await Promise.all([
        resolvePlaybackUrl(next.localBlobId, next.storagePath),
        getPlaybackPositionMs(upcomingSongId),
      ])
      const spare = otherDeck(decksRef.current, audioRef.current)
      if (!live || !url || !spare) return
      const startMs = startPositionMs(next.trimStartMs, savedMs)
      const held = preparedRef.current
      if (held && held.el === spare && held.versionId === next.id && held.url === url) {
        held.index = upcomingIndex
        held.startMs = startMs
        return
      }
      // The element that just handed over may still be playing its last
      // few milliseconds. Let it finish before giving it a new file.
      await whenIdle(spare)
      if (!live || spare === audioRef.current) return
      preparedRef.current = { index: upcomingIndex, versionId: next.id, url, startMs, el: spare }
      spare.preload = 'auto'
      spare.playbackRate = usePlayerStore.getState().playbackRate
      if (spare.src !== url) spare.src = url
      // A start point is set once the length is known; before that iOS ignores it.
      if (startMs > 0) {
        const seek = () => {
          if (spare !== audioRef.current) spare.currentTime = startMs / 1000
        }
        if (spare.readyState >= HTMLMediaElement.HAVE_METADATA) seek()
        else spare.addEventListener('loadedmetadata', seek, { once: true })
      }
    })()
    return () => {
      live = false
    }
  }, [sourceReady, isPlaying, upcomingIndex, upcomingVersionId, upcomingSongId, nearEnd, deckGen])

  /* GAPLESS, PART 2: start the next element a few milliseconds before this
     one runs out, so it is already sounding when this one stops. */
  const trimEndMsRef = useRef<number | null>(null)
  const trimEndMs = version?.trimEndMs ?? null
  useEffect(() => {
    trimEndMsRef.current = trimEndMs
  }, [trimEndMs])
  const readHandoff = useCallback((): HandoffReading | null => {
    const el = audioRef.current
    const prepared = preparedRef.current
    if (!el || !prepared || prepared.el === el || endedRef.current) return null
    if (!isRealAudioSrc(el) || el.paused || !el.duration || !Number.isFinite(el.duration)) return null
    const trimEnd = trimEndMsRef.current
    const endSec = trimEnd && trimEnd / 1000 < el.duration ? trimEnd / 1000 : el.duration
    return { currentTimeSec: el.currentTime, endSec, rate: el.playbackRate || 1, leadMs: leadMsRef.current }
  }, [])

  const handOff = useCallback(() => {
    const from = audioRef.current
    const prepared = preparedRef.current
    if (!from || !prepared || prepared.el === from || endedRef.current) return
    const state = usePlayerStore.getState()
    const next = peekNextAtEnd(state)
    if (!state.isPlaying || !next || next.index !== prepared.index || next.item.audioVersionId !== prepared.versionId) {
      return
    }
    const to = prepared.el
    preparedRef.current = null
    const startSec = prepared.startMs / 1000
    if (Math.abs(to.currentTime - startSec) > 0.05) to.currentTime = startSec
    // Make it the element in charge before it starts, so the old one's own
    // pause and ended events are ignored rather than read as the end.
    makeActive(to)
    handedOffRef.current = { versionId: prepared.versionId, at: performance.now() }
    lastSavedMsRef.current = 0
    // A trimmed take stops at its trim point, not its real end.
    if (trimEndMsRef.current) from.pause()
    const calledAt = performance.now()
    to.addEventListener(
      'playing',
      () => {
        leadMsRef.current = nextLeadMs(leadMsRef.current, performance.now() - calledAt)
      },
      { once: true },
    )
    void to.play().catch((err: Error) => {
      if (err?.name === 'AbortError') return
      // Refused: this element never got its unlock (iOS wants a tap first).
      if (audioRef.current !== to) return
      fallBackTo(from, prepared.url, startSec)
    })
    showDeck(to)
    setDeckGen((gen) => gen + 1)
    usePlayerStore.getState().advanceGapless(prepared.index, prepared.versionId)
  }, [makeActive, showDeck, fallBackTo])

  const schedulerRef = useRef<HandoffScheduler | null>(null)
  useEffect(() => {
    const scheduler = new HandoffScheduler(readHandoff, handOff)
    schedulerRef.current = scheduler
    return () => scheduler.cancel()
  }, [readHandoff, handOff])
  // A fresh start per take (and per handoff, which can keep the same take
  // when a one-track playlist loops).
  useEffect(() => {
    schedulerRef.current?.reset()
    return () => schedulerRef.current?.cancel()
  }, [currentVersionId, loadRequest, deckGen])
  // Pausing, a speed change or a newly ready take can all move the moment.
  useEffect(() => {
    schedulerRef.current?.poke()
  }, [isPlaying, playbackRate, sourceReady])
  const pokeHandoff = () => schedulerRef.current?.poke()

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

  // The <audio> elements are ALWAYS rendered so they are never unmounted between
  // track changes. Unmounting would lose the iOS gesture-unlock state on the
  // element and force a new unlock cycle on every song tap.
  // Only the visible player bar footer is conditional.
  const showBar = Boolean(currentVersionId && displaySong)

  return (
    <>
      {[0, 1].map((deck) => (
      <audio
        key={deck}
        ref={deck === 0 ? deckRefA : deckRefB}
        onLoadedMetadata={(event) => {
          if (event.currentTarget !== audioRef.current) return
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
          if (event.currentTarget !== audioRef.current) return
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
          if (event.currentTarget !== audioRef.current) return
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
          if (event.currentTarget !== audioRef.current) return
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
          if (event.currentTarget !== audioRef.current) return
          if (!isRealAudioSrc(event.currentTarget)) return
          setBuffering(false)
          useLoadProgress.getState().done(currentVersionId)
        }}
        onDurationChange={(event) => {
          if (event.currentTarget !== audioRef.current) return
          const el = event.currentTarget
          const fraction = isRealAudioSrc(el) ? bufferedFraction(el) : null
          if (currentVersionId && fraction != null) useLoadProgress.getState().update(currentVersionId, fraction)
        }}
        onProgress={(event) => {
          if (event.currentTarget !== audioRef.current) return
          const el = event.currentTarget
          if (!isRealAudioSrc(el)) return
          const fraction = bufferedFraction(el)
          if (fraction == null) return
          setBufferProgress(fraction)
          if (currentVersionId) useLoadProgress.getState().update(currentVersionId, fraction)
        }}
        onTimeUpdate={(event) => {
          if (event.currentTarget !== audioRef.current) return
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
            pokeHandoff()
          }
        }}
        onPause={(event) => {
          if (event.currentTarget !== audioRef.current) return
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
          if (event.currentTarget !== audioRef.current) return
          // The 1-sample unlock clip "ends" too. That must never skip a song.
          if (!isRealAudioSrc(event.currentTarget)) return
          void handleEnded()
        }}
        onSeeked={(event) => {
          if (event.currentTarget === audioRef.current) pokeHandoff()
        }}
        onRateChange={(event) => {
          if (event.currentTarget === audioRef.current) pokeHandoff()
        }}
      />
      ))}

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
