import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { trackPixelEvent } from '@/lib/metaPixel'
import { getCheckoutReceipt } from '@/lib/billing'
import { trackGa4Purchase, trackGa4SignUp } from '@/lib/ga4'

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
 * Purchase: when Stripe sends someone back with ?checkout=done. The event id
 * is the Stripe session id, the same one the webhook sends from the server,
 * so Meta counts the purchase once. Value and currency are read back from
 * Stripe rather than assumed, because Adaptive Pricing can charge in another
 * currency. The query is removed first, so a refresh cannot report twice.
 *
 * Each is also sent to GA4 (sign_up and purchase, the Stripe session id as
 * transaction_id) through the same once-only path.
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
      trackGa4SignUp(data.user.app_metadata?.provider === 'google' ? 'google' : 'email')
    })

    const url = new URL(window.location.href)
    if (url.searchParams.get('checkout') === 'done') {
      const sessionId = url.searchParams.get('session_id')
      url.searchParams.delete('checkout')
      url.searchParams.delete('session_id')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      if (sessionId) {
        void getCheckoutReceipt(sessionId)
          .then((receipt) => {
            if (cancelled || !receipt.paid || !receipt.eventId) return
            trackPixelEvent(
              'Purchase',
              {
                value: receipt.value ?? 0,
                currency: receipt.currency ?? 'USD',
                content_name: receipt.plan ?? 'year',
              },
              receipt.eventId,
            )
            trackGa4Purchase(sessionId, receipt.value ?? 0, receipt.currency ?? 'USD', receipt.plan ?? 'year')
          })
          .catch(() => {
            /* the server copy from the webhook still counts it */
          })
      }
    }

    return () => {
      cancelled = true
    }
  }, [])
}
