import { useEffect, useState } from 'react'

const STORAGE_KEY = 'memo-theme'

type Theme = 'dark' | 'light'

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Theme follows the OS. Dark is the identity, mist is the train.
 *
 * The system decides until the person actually chooses. Previously the effect
 * wrote to localStorage on every mount, so the very first render stamped a
 * value and the OS preference was never consulted again — "follows the OS"
 * held exactly once, then silently stopped. Now only an explicit toggle
 * persists, and an un-chosen theme tracks the OS live.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    // Only track the OS while the person has not made a choice.
    if (storedTheme()) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setThemeState(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = () =>
    setThemeState((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {}
      return next
    })

  return { theme, toggle }
}
