import { registerSW } from 'virtual:pwa-register'
import { shouldReloadNow } from './updatePolicy'

type Listener = () => void

const listeners = new Set<Listener>()
let reloadPending = false

export function subscribePwaUpdate(listener: Listener) {
  listeners.add(listener)
  if (reloadPending) listener()
  return () => {
    listeners.delete(listener)
  }
}

/** The banner's button. The new build is already active; this just loads it. */
export function applyPwaUpdate() {
  window.location.reload()
}

function notifyUpdateReady() {
  listeners.forEach((listener) => listener())
}

// When the app was last opened or brought back to the foreground.
let shownAt = 0

const RELOAD_GUARD = 'sd-sw-autoreload-at'

function reloadGuarded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0)
    if (Number.isFinite(at) && Date.now() - at < 10_000) return false
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()))
  } catch {
    // No sessionStorage: reload anyway, the worker only activates once.
  }
  window.location.reload()
  return true
}

function currentUiState() {
  const active = document.activeElement as HTMLElement | null
  const editing = Boolean(
    active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable),
  )
  const playing = Array.from(document.querySelectorAll('audio, video')).some(
    (el) => !(el as HTMLMediaElement).paused,
  )
  return {
    onAppRoute: window.location.pathname.startsWith('/app'),
    editing,
    playing,
    hidden: document.visibilityState === 'hidden',
    sinceLoadMs: performance.now() - shownAt,
  }
}

/**
 * A new build has taken over. Load it at a safe moment.
 *
 * WHY THE PHONE "LOOKED OLD" (18 Sept, likely rather than proven). /app is
 * served offline-first from the precache, so every launch of the installed
 * app paints the build that was cached last time. The new build only arrives
 * once the worker checks, downloads every file and activates. That check used
 * to wait for an idle callback plus five seconds, and the onNeedRefresh
 * handler that was meant to decide when to reload never ran at all: with
 * registerType 'autoUpdate' vite-plugin-pwa only ever calls onNeedReload
 * (or reloads unconditionally), so a mid-edit reload could also happen.
 *
 * Now: check straight away on start and on every return to the foreground,
 * and when the new build is active reload at once if nothing is in progress
 * (the usual case right after launch), otherwise the moment the app goes to
 * the background, with a small banner meanwhile. Offline-first loading is
 * unchanged.
 */
function onNewBuildActive() {
  if (shouldReloadNow(currentUiState()) && reloadGuarded()) return
  reloadPending = true
  notifyUpdateReady()
}

export function initPwa() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onNeedReload: onNewBuildActive,
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = () => {
        if (!navigator.onLine) return
        void registration.update().catch(() => {
          // Offline or the server hiccuped. The next foreground tries again.
        })
      }

      // Debounced so a burst of focus events is one request.
      let last = 0
      const checkThrottled = () => {
        const now = Date.now()
        if (now - last < 10_000) return
        last = now
        check()
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          shownAt = performance.now()
          checkThrottled()
          return
        }
        // Going to the background is the safe moment for a waiting reload.
        if (reloadPending && shouldReloadNow(currentUiState())) reloadGuarded()
      })
      window.addEventListener('pageshow', checkThrottled)
      window.addEventListener('focus', checkThrottled)
      window.addEventListener('online', checkThrottled)

      // Backstop for an app left open and visible.
      window.setInterval(check, 15 * 60 * 1000)

      // At once: a stale install heals on this launch, not the next one.
      checkThrottled()
    },
  })
}
