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

export function registerAudioEl(el: HTMLAudioElement | null) {
  audioEl = el
}

// Tiny silent WAV (44 bytes) — used to unlock iOS autoplay on first gesture.
const SILENT =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

let audioUnlocked = false

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
      // Unlock the main element directly — most reliable on iOS Safari
      const prev = audioEl.src
      audioEl.src = SILENT
      void audioEl.play().then(() => {
        audioEl!.pause()
        // Restore previous src (or clear if none)
        audioEl!.src = prev || ''
        if (prev) srcSwitchPending = true
      }).catch(() => {
        audioEl!.src = prev || ''
      })
    } else {
      // Main element not mounted yet — fall back to temp element
      const tmp = new Audio(SILENT)
      void tmp.play().catch(() => {})
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('touchstart', unlock, { once: true, capture: true })
}

/**
 * Called from a gesture handler when the URL is already cached.
 * Sets src and calls play() immediately so iOS grants autoplay permission
 * before any await boundary is crossed. Returns true if attempted.
 */
export function playAudioImmediately(url: string, playbackRate: number): boolean {
  if (!audioEl) return false
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
export function unlockAudioEl() {
  if (!audioEl || !audioEl.paused) return
  void audioEl.play().catch(() => {})
  // Do NOT pause — that fires onPause → setPlaying(false).
}
