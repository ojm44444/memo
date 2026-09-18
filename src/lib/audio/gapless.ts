/**
 * Gapless playback: hand the music from one <audio> element to a second one
 * that already holds the next track.
 *
 * WHY TWO ELEMENTS (18 Sept, Owen asked for true gapless). With one element
 * the next track can only be loaded once the current one has ended: `ended`
 * fires, the store moves on, the player resolves a URL, sets `src`, and the
 * browser opens and decodes the new file before a sample comes out. That is
 * the gap. Here the next track is loaded on a second element while the
 * current one plays, and started a few milliseconds before the current one
 * runs out, so the new file is already decoded and running when the old one
 * stops.
 *
 * WHY NOT WEB AUDIO. Decoding both tracks into AudioBuffers would give
 * sample-exact joins, but a 5 minute 48 kHz stereo mix is over 100 MB of
 * float samples per track, which is how an iPhone tab gets killed. Routing the
 * elements through an AudioContext (MediaElementAudioSourceNode) does not help
 * the timing (an element still cannot be started at a scheduled AudioContext
 * time), needs CORS on every signed URL, and on iOS ties playback to an
 * AudioContext that WebKit suspends when the screen locks. Plain elements keep
 * lock-screen playback and the media session exactly as they were.
 *
 * WHAT THIS CAN AND CANNOT DO. The join is as tight as the browser's start
 * latency for an element that is already loaded, which is corrected for by
 * starting the next track `leadMs` early (measured, see nextLeadMs). WAV,
 * AIFF and FLAC carry no encoder padding, so what remains is that start
 * latency. MP3 and AAC files carry silent encoder padding at both ends
 * (LAME / iTunSMPB). Whether it is trimmed is up to the browser's decoder, and
 * this code cannot trim it from outside an element, so a padded file still
 * has that padding at the join.
 */

/** Arm the precise timer once the end is this close (timeupdate ticks every 250 ms or so). */
export const HANDOFF_WINDOW_MS = 1000
/** Close enough to the target to start now rather than wait again. */
export const HANDOFF_TOLERANCE_MS = 3
/** Never start the next track more than this much early. */
export const MAX_LEAD_MS = 60

export interface HandoffReading {
  /** Where the playing element is, in seconds. */
  currentTimeSec: number
  /** Where it will stop: its duration, or a trim-end point. */
  endSec: number
  /** Its playback rate. Real time to the end shrinks as the rate goes up. */
  rate: number
  /** How early to start the next element to cover its start latency. */
  leadMs: number
}

/** Milliseconds of real time until the next element should be started. */
export function msUntilHandoff(reading: HandoffReading): number {
  const rate = reading.rate > 0 && Number.isFinite(reading.rate) ? reading.rate : 1
  return ((reading.endSec - reading.currentTimeSec) * 1000) / rate - reading.leadMs
}

/**
 * Update the start-latency estimate from one measured handoff: the time from
 * play() on the next element to its `playing` event. A running average, so
 * one slow start (a busy main thread) does not throw the next join off, and
 * clamped so a stall can never make tracks overlap audibly.
 */
export function nextLeadMs(previousMs: number, measuredMs: number): number {
  if (!Number.isFinite(measuredMs) || measuredMs < 0) return previousMs
  const blended = previousMs * 0.6 + Math.min(measuredMs, MAX_LEAD_MS) * 0.4
  return Math.max(0, Math.min(MAX_LEAD_MS, blended))
}

export interface HandoffClock {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

const realClock: HandoffClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

/**
 * Fires `onDue` once, at the moment the next element should start.
 *
 * `read` returns fresh numbers from the playing element, or null when there is
 * nothing to hand over to (paused, no next track ready). Call `poke()` on
 * every timeupdate, seek, rate change and play/pause: it arms a timer once
 * the end is within HANDOFF_WINDOW_MS. When the timer fires it reads again,
 * so a seek, a rate change or a timer that ran early only re-arms it. A timer
 * that runs late (a hidden tab) still fires; the caller's `ended` handler
 * covers the case where the element got there first.
 */
export class HandoffScheduler {
  private timer: unknown = null
  private fired = false
  private readonly read: () => HandoffReading | null
  private readonly onDue: () => void
  private readonly clock: HandoffClock

  constructor(read: () => HandoffReading | null, onDue: () => void, clock: HandoffClock = realClock) {
    this.read = read
    this.onDue = onDue
    this.clock = clock
  }

  /** Re-read the element and arm, re-arm or disarm the timer. */
  poke() {
    if (this.fired) return
    const reading = this.read()
    if (!reading) {
      this.clearTimer()
      return
    }
    const ms = msUntilHandoff(reading)
    if (ms <= HANDOFF_TOLERANCE_MS) {
      this.fire()
      return
    }
    if (ms > HANDOFF_WINDOW_MS) {
      this.clearTimer()
      return
    }
    this.clearTimer()
    this.timer = this.clock.setTimeout(() => {
      this.timer = null
      this.poke()
    }, ms)
  }

  /** Stop without firing. A new track needs `reset()`. */
  cancel() {
    this.clearTimer()
  }

  /** Ready for the next track. */
  reset() {
    this.clearTimer()
    this.fired = false
  }

  get hasFired() {
    return this.fired
  }

  private fire() {
    this.clearTimer()
    this.fired = true
    this.onDue()
  }

  private clearTimer() {
    if (this.timer != null) this.clock.clearTimeout(this.timer)
    this.timer = null
  }
}

/** The element of the pair that is not `active`. */
export function otherDeck(
  decks: ReadonlyArray<HTMLAudioElement | null>,
  active: HTMLAudioElement | null,
): HTMLAudioElement | null {
  return decks.find((el) => el && el !== active) ?? null
}

/**
 * Resolves once `el` is not playing any more: already idle, its `ended` or
 * `pause`, or after `timeoutMs`. Used before loading the next track onto the
 * element that has just handed over, which may still be playing its last few
 * milliseconds.
 */
export function whenIdle(el: HTMLMediaElement, timeoutMs = 1000): Promise<void> {
  if (el.paused || el.ended) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('ended', done)
      el.removeEventListener('pause', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    el.addEventListener('ended', done)
    el.addEventListener('pause', done)
  })
}
