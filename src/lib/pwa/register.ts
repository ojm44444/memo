import { registerSW } from 'virtual:pwa-register'

type Listener = () => void

const listeners = new Set<Listener>()
let applyUpdate: (() => void) | null = null

export function subscribePwaUpdate(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function applyPwaUpdate() {
  applyUpdate?.()
}

function notifyUpdateReady() {
  listeners.forEach((listener) => listener())
}

export function initPwa() {
  if (!('serviceWorker' in navigator)) return

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      /**
       * Take the update automatically on a fresh page load.
       *
       * THIS IS THE BUG THAT MADE THE SITE "LOOK THE SAME EVERY TIME".
       * The service worker serves the PRECACHED index.html for every
       * navigation (NavigationRoute -> createHandlerBoundToURL), and it
       * deliberately does not skipWaiting on install. So a new build installs,
       * sits in "waiting", and the OLD worker keeps answering every navigation
       * with the OLD index.html and therefore the OLD asset hashes. Reloading
       * does not help - the reload is served by the same waiting-blocked
       * worker. The only escapes were clicking the update banner or closing
       * every window, so anyone who missed the banner was pinned to a stale
       * build permanently, however many times they visited.
       *
       * A fresh navigation is the safe moment to activate: there is no
       * in-flight session to break, which was the original reason for not
       * calling skipWaiting on install. Mid-session updates still go through
       * the banner. sessionStorage guards against a reload loop.
       */
      /**
       * TWO BUGS IN THE PREVIOUS VERSION OF THIS GUARD, both of which pinned
       * people to a stale build for a whole session.
       *
       * 1. The guard was a session-long boolean that was set and never
       *    cleared. It correctly stopped a reload loop, and then it also
       *    stopped EVERY subsequent update for the life of the tab. Ten
       *    deploys in an afternoon meant the first one auto-applied and the
       *    other nine silently did not. It is now a timestamp, so it blocks
       *    a second reload within ten seconds (which is all a loop guard
       *    needs to do) and allows the next genuine update after that.
       *
       * 2. `performance.now() < 20_000` meant an update detected more than
       *    twenty seconds after load never auto-applied. Updates are checked
       *    at five seconds, on focus, on visibility, on reconnect and every
       *    fifteen minutes, so in practice almost every update arrived
       *    outside that window and fell through to the banner. Anyone who
       *    did not spot the banner stayed on the old build indefinitely.
       *
       * The original reason for the freshness check was not to yank the page
       * out from under someone mid-session. That risk is real on /app, where
       * there can be unsaved work, and absent on the marketing pages, where
       * there is nothing to lose. So the condition is now about WHERE you
       * are, not how long ago you loaded.
       */
      const RELOAD_GUARD = 'sd-sw-autoreload-at'
      let recentlyReloaded = false
      try {
        const at = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0)
        recentlyReloaded = Number.isFinite(at) && Date.now() - at < 10_000
      } catch {}

      const onAppRoute = window.location.pathname.startsWith('/app')
      const safeToReload = !onAppRoute

      if (safeToReload && !recentlyReloaded) {
        try {
          sessionStorage.setItem(RELOAD_GUARD, String(Date.now()))
        } catch {}
        // Deferred: onNeedRefresh can fire before registerSW() has returned,
        // so applyUpdate may not be assigned yet at this point.
        setTimeout(() => applyUpdate?.(), 0)
        return
      }

      notifyUpdateReady()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return

      /**
       * Updates have to actually arrive.
       *
       * This used to be a lone 60-minute setInterval, which fails twice: an
       * app left open waits up to an hour, and browsers throttle timers hard
       * in background tabs, so a backgrounded PWA can go far longer. That is
       * how an open install served a build two identities old.
       *
       * Now: check when the tab becomes visible (the "next focus" case),
       * when connectivity returns, and on a much shorter timer as a backstop.
       */
      const check = () => {
        void registration.update()
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
        if (document.visibilityState === 'visible') checkThrottled()
      })
      window.addEventListener('focus', checkThrottled)
      window.addEventListener('online', checkThrottled)

      // Backstop for a tab left open and visible.
      window.setInterval(check, 15 * 60 * 1000)

      // And once shortly after boot, so a stale install heals on next open.
      window.setTimeout(check, 5_000)
    },
  })
}
