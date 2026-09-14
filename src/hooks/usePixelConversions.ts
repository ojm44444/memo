import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { trackPixelEvent } from '@/lib/metaPixel'

const REGISTERED_KEY = 'songdrafts:pixel-registration-sent'

/** An account is "new" for this long after it was created. */
const NEW_ACCOUNT_WINDOW_MS = 15 * 60_000

/**
 * The two conversion events that happen inside the app.
 *
 * CompleteRegistration: the first time a brand new account reaches the
 * board, judged by the account's own created_at, so an existing user signing
 * in on a new device is not counted as a sign-up. Once per device.
 *
 * Subscribe: when Stripe sends someone back with ?checkout=done. The Stripe
 * session id, when present, is the event id, so the server-side Conversions
 * API can report the same purchase later without Meta counting it twice. The
 * query is then removed, so a refresh cannot report a second purchase.
 *
 * Neither sends anything but the event: no email, no name, no board content.
 */
export function usePixelConversions() {
  useEffect(() => {
    let cancelled = false

    void supabase?.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user?.created_at) return
      const age = Date.now() - new Date(data.user.created_at).getTime()
      try {
        if (age > NEW_ACCOUNT_WINDOW_MS || localStorage.getItem(REGISTERED_KEY)) return
        localStorage.setItem(REGISTERED_KEY, '1')
      } catch {
        return
      }
      trackPixelEvent('CompleteRegistration')
    })

    const url = new URL(window.location.href)
    if (url.searchParams.get('checkout') === 'done') {
      const sessionId = url.searchParams.get('session_id') ?? undefined
      trackPixelEvent('Subscribe', {}, sessionId)
      url.searchParams.delete('checkout')
      url.searchParams.delete('session_id')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }

    return () => {
      cancelled = true
    }
  }, [])
}
