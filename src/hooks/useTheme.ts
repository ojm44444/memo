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

/**
 * Dark by default. Owen's call (29 Aug), overriding the earlier follow-the-OS
 * ruling: dark is the designed-first identity and it is what the tool opens
 * in, regardless of the OS. An explicit toggle persists either way, and
 * choosing light gets the first-class light theme, not a fallback. The OS
 * preference is no longer consulted.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => storedTheme() ?? 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

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
