/**
 * Singleton reference to the app's single <audio> element in ColumnPlayerBar.
 *
 * iOS Safari / Chrome Mobile revoke the user-gesture context after any
 * await boundary. These helpers let gesture handlers call audio.play()
 * synchronously — before any async work — so iOS allows playback.
 */
let audioEl: HTMLAudioElement | null = null
/**
 * The second element of the gapless pair (see gapless.ts). It holds the next
 * track while `audioEl` plays, and the two swap at every gapless handoff. iOS
 * only lets an element start without a tap once it has played inside one, so
 * every unlock below covers this one too.
 */
let spareEl: HTMLAudioElement | null = null
const unlockedEls = new WeakSet<HTMLAudioElement>()
let pendingSpareUnlock = false

// Set to true when playAudioImmediately changes the src so the onPause event
// that the browser fires for the old src doesn't incorrectly stop playback.
let srcSwitchPending = false

export function consumeSrcSwitchPending(): boolean {
  const val = srcSwitchPending
  srcSwitchPending = false
  return val
}

export function markSrcSwitch() {
  srcSwitchPending = true
}

// Tiny silent WAV (44 bytes) — used to unlock iOS autoplay on first gesture.
const SILENT =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

let audioUnlocked = false
// True when the gesture fired before the main element mounted — we need to
// unlock the main element as soon as it registers.
let pendingMainUnlock = false

// Set by playAudioImmediately() to signal that the real src is now loaded.
// unlockMainEl checks this before restoring the prev src after pausing SILENT.
let realSrcSet = false

/**
 * True when the element holds a real song, not the silent unlock clip and not
 * nothing. ColumnPlayerBar ignores media events from anything else.
 *
 * THE FIRST-CLICK BUG, THIRD AND ACTUAL CAUSE (18 Sept). The unlock clip is a
 * real media load, so it fired canplay (ColumnPlayerBar set sourceReady=true)
 * and, when the clip was put away with `src = ''`, an error event and an
 * element stuck in MEDIA_ERR_SRC_NOT_SUPPORTED. The first real click then set
 * isPlaying, the play effect saw the stale sourceReady and called play() on
 * that errored, empty element, which rejects at once with NotSupportedError,
 * and the catch set isPlaying back to false. loadSource finished a moment
 * later, found isPlaying false, and armed the song without playing it. The
 * second click hit the URL cache and worked. Every first click of a session
 * went this way, whenever it happened, because the unlock runs on the very
 * first pointerdown and finishes within milliseconds.
 */
export function isRealAudioSrc(el: HTMLMediaElement | null | undefined): boolean {
  if (!el) return false
  const attr = el.getAttribute('src')
  return Boolean(attr) && attr !== SILENT
}

/** Put the element back to "no source" without an error event. */
function clearSrc(el: HTMLAudioElement) {
  // `el.src = ''` is NOT empty: it is a failed load that fires `error` and
  // leaves the element errored. No src attribute at all is a clean idle state.
  el.removeAttribute('src')
  try {
    el.load()
  } catch {
    // jsdom and very old engines. Nothing to reset in that case.
  }
}

function unlockMainEl(el: HTMLAudioElement) {
  realSrcSet = false
  el.src = SILENT
  void el.play().then(() => {
    audioUnlocked = true
    unlockedEls.add(el)
    if (realSrcSet) {
      // Real audio took over while SILENT was starting. Leave it alone.
      return
    }
    el.pause()
    clearSrc(el)
  }).catch(() => {
    // Refused (no gesture) or interrupted by a real src. Only tidy up if
    // nothing real has taken the element in the meantime.
    if (!realSrcSet && el.getAttribute('src') === SILENT) clearSrc(el)
  })
}

/**
 * Play the silent clip on an element that is not the one in charge, so iOS
 * lets it start later without a tap. Never touches an element holding a real
 * song (a preloaded next track stays loaded), and puts the clip away only if
 * nothing real arrived meanwhile.
 */
export function unlockSpareElement(el: HTMLAudioElement | null) {
  if (!el || unlockedEls.has(el) || isRealAudioSrc(el) || !el.paused) return
  el.src = SILENT
  void el
    .play()
    .then(() => {
      unlockedEls.add(el)
      if (el.getAttribute('src') !== SILENT) return
      el.pause()
      clearSrc(el)
    })
    .catch(() => {
      if (el.getAttribute('src') === SILENT) clearSrc(el)
    })
}

/**
 * Install a one-time listener that fires on the user's very first touch/click
 * and plays the main audio element with a silent WAV to unlock iOS autoplay
 * for the session. Unlocking the main element (not a temp one) ensures that
 * subsequent play() calls on it are always granted.
 * Call once at app startup.
 */
export function installAudioUnlock() {
  if (typeof window === 'undefined') return
  const unlock = () => {
    unlockSpareElement(spareEl)
    if (audioUnlocked) return
    if (audioEl) {
      // Already holding a real song: never swap it for the silent clip, or the
      // player loses its source. Playing or not, leave it to the play paths.
      if (isRealAudioSrc(audioEl)) {
        if (!audioEl.paused) audioUnlocked = true
        return
      }
      // A clip is already starting from an earlier event of the same tap.
      if (audioEl.getAttribute('src') === SILENT && !audioEl.paused) return
      // Marked unlocked only once play() succeeds, so an event that iOS does
      // not count as a gesture (pointerdown, touchstart) gets another go on
      // the touchend or click that follows.
      unlockMainEl(audioEl)
    } else if (!pendingMainUnlock) {
      // Main element not mounted yet — unlock it the moment it registers.
      pendingMainUnlock = true
      pendingSpareUnlock = true
      // Also play a temp element to keep the gesture context alive across
      // the async gap until the main element mounts.
      const tmp = new Audio(SILENT)
      void tmp.play().catch(() => {})
    }
  }
  // pointerdown and touchstart are not user activation on iOS; touchend and
  // click are. Listen to all of them; `audioUnlocked` makes it once only.
  for (const type of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true })
  }
}

export function registerAudioEl(el: HTMLAudioElement | null) {
  audioEl = el
  if (el && pendingMainUnlock) {
    pendingMainUnlock = false
    unlockMainEl(el)
  }
}

/** The other element of the gapless pair. */
export function registerSpareAudioEl(el: HTMLAudioElement | null) {
  spareEl = el
  if (el && pendingSpareUnlock) {
    pendingSpareUnlock = false
    unlockSpareElement(el)
  }
}

/**
 * A gapless handoff: `el` (the old spare) is now the element in charge. The
 * tap paths (playAudioImmediately, seekAudioTo, unlockAudioEl) follow it.
 */
export function swapActiveAudioEl(el: HTMLAudioElement) {
  if (el === audioEl) return
  const previous = audioEl
  audioEl = el
  spareEl = previous
  // It has been told to play without a tap before, or is about to be. Either
  // way it is real audio now, and the unlock must leave it alone.
  realSrcSet = true
}

/**
 * Called from a gesture handler when the URL is already cached.
 * Sets src and calls play() immediately so iOS grants autoplay permission
 * before any await boundary is crossed. Returns true if attempted.
 */
export function playAudioImmediately(url: string, playbackRate: number): boolean {
  if (!audioEl) return false
  realSrcSet = true  // signal to unlockMainEl that real audio is in control
  if (audioEl.src !== url) srcSwitchPending = true
  audioEl.src = url
  audioEl.playbackRate = playbackRate
  void audioEl.play().catch(() => {})
  return true
}

/**
 * Fallback: call play() in gesture context to keep iOS autoplay alive
 * across an upcoming async boundary. Only acts when audio is paused —
 * if it's already playing, it's already unlocked.
 */
export function seekAudioTo(ms: number): boolean {
  if (!audioEl || !audioEl.duration) return false
  audioEl.currentTime = ms / 1000
  return true
}

/**
 * Claim the element for real audio.
 *
 * THE FIRST-CLICK-DOES-NOTHING BUG. The unlock plays a SILENT wav on the first
 * pointerdown, then in its .then() restores the previous src and PAUSES -
 * unless realSrcSet says real audio took over. Only playAudioImmediately()
 * ever set that flag, and it is skipped when the URL is not cached yet, which
 * is exactly the first play of a session. So the sequence was:
 *   pointerdown -> src = SILENT, play()
 *   click       -> async load sets the REAL src and plays
 *   SILENT then -> realSrcSet false -> pause() and wipe the src
 * The first click loaded the song and then had it torn out from under it. The
 * second click hit the cache, went through playAudioImmediately, set the flag,
 * and worked - which is why it always took exactly two clicks.
 */
export function markRealSrcSet() {
  realSrcSet = true
}

/**
 * Called from a tap when the song's URL is not resolved yet. Plays the silent
 * clip on the real element inside the gesture, which is what iOS needs to let
 * the async play() that follows through. The store's loadRequest makes the
 * player reload the real source afterwards, even for the same song.
 */
export function unlockAudioEl() {
  unlockSpareElement(spareEl)
  if (!audioEl || !audioEl.paused) return
  unlockMainEl(audioEl)
}

/** Test seam. */
export function __resetGlobalAudioForTests() {
  audioEl = null
  spareEl = null
  audioUnlocked = false
  pendingMainUnlock = false
  pendingSpareUnlock = false
  realSrcSet = false
  srcSwitchPending = false
}

export const SILENT_SRC = SILENT
