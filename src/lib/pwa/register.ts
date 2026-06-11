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
      window.setInterval(() => {
        void registration.update()
      }, 60 * 60 * 1000)
    },
  })
}
