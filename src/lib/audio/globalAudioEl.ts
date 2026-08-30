/**
 * Singleton reference to the app's single <audio> element in ColumnPlayerBar.
 *
 * iOS Safari / Chrome Mobile revoke the user-gesture context after any
 * await boundary. These helpers let gesture handlers call audio.play()
 * synchronously — before any async work — so iOS allows playback.
 */
let audioEl: HTMLAudioElement | null = null

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

function unlockMainEl(el: HTMLAudioElement) {
  const prev = el.src
  realSrcSet = false
  el.src = SILENT
  void el.play().then(() => {
    if (realSrcSet) {
      // playAudioImmediately() fired while SILENT was playing and already
      // changed the src to real audio. Don't touch it — just ensure play()
      // is running (it already called play(), so nothing to do here).
      return
    }
    // SILENT finished and nothing took over — restore the element to a clean state.
    srcSwitchPending = true
    el.pause()
    el.src = prev || ''
  }).catch(() => {
    // Play was interrupted (e.g. src changed by playAudioImmediately mid-flight).
    // If real audio is now in control, leave it alone.
    if (!realSrcSet) el.src = prev || ''
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
    if (audioUnlocked) return
    audioUnlocked = true
    if (audioEl) {
      unlockMainEl(audioEl)
    } else {
      // Main element not mounted yet — unlock it the moment it registers.
      pendingMainUnlock = true
      // Also play a temp element to keep the gesture context alive across
      // the async gap until the main element mounts.
      const tmp = new Audio(SILENT)
      void tmp.play().catch(() => {})
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('touchstart', unlock, { once: true, capture: true })
}

export function registerAudioEl(el: HTMLAudioElement | null) {
  audioEl = el
  if (el && pendingMainUnlock) {
    pendingMainUnlock = false
    unlockMainEl(el)
  }
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

export function unlockAudioEl() {
  if (!audioEl || !audioEl.paused) return
  void audioEl.play().catch(() => {})
  // Do NOT pause — that fires onPause → setPlaying(false).
}
