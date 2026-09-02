import { useEffect } from 'react'

/**
 * Every route shared one <title> and one description, so /privacy, /terms
 * and /sign-in were indistinguishable in a tab bar and read as duplicates of
 * the homepage to a crawler. Set per page, restored on unmount.
 */
export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    const prevTitle = document.title
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = meta?.content
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const prevCanon = canonical?.href

    document.title = title
    if (meta && description) meta.content = description
    if (canonical) canonical.href = window.location.origin + window.location.pathname

    return () => {
      document.title = prevTitle
      if (meta && prevDesc != null) meta.content = prevDesc
      if (canonical && prevCanon) canonical.href = prevCanon
    }
  }, [title, description])
}
