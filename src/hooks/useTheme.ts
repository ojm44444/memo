import { useEffect, useState } from 'react'

const STORAGE_KEY = 'memo-theme'

function getInitialTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  const toggle = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggle }
}
