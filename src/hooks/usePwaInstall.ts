import { useCallback, useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detectInstalledPwa() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/*
 * The browser fires beforeinstallprompt once per page load. A hook that only
 * listens while mounted misses it if the tour or Settings opens later, so the
 * event is caught here at module load (App imports this through the install
 * banner) and every component reads the same state.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null
let state = { canInstall: false, isInstalled: detectInstalledPwa() }
const listeners = new Set<() => void>()

function setState(next: Partial<typeof state>) {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    setState({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    setState({ isInstalled: true, canInstall: false })
  })
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const getSnapshot = () => state

export function usePwaInstall() {
  const { canInstall, isInstalled } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const install = useCallback(async () => {
    const prompt = deferredPrompt
    if (!prompt) return false

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    deferredPrompt = null

    if (outcome === 'accepted') {
      setState({ canInstall: false, isInstalled: true })
      return true
    }
    setState({ canInstall: false })
    return false
  }, [])

  return { canInstall, isInstalled, install }
}
