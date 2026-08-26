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
