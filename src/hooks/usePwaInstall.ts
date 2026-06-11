import { useCallback, useEffect, useRef, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detectInstalledPwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function usePwaInstall() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(detectInstalledPwa)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      deferredPrompt.current = event as BeforeInstallPromptEvent
      setCanInstall(true)
    }

    const onInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      deferredPrompt.current = null
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    const prompt = deferredPrompt.current
    if (!prompt) return false

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    deferredPrompt.current = null
    setCanInstall(false)

    if (outcome === 'accepted') {
      setIsInstalled(true)
      return true
    }

    return false
  }, [])

  return { canInstall, isInstalled, install }
}
