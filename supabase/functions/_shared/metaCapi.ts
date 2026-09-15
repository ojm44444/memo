/**
 * Meta Conversions API, server side. Only ever for someone who said yes.
 *
 * The browser pixel and this send the SAME event with the SAME event_id, and
 * Meta counts it once. The server copy exists because a browser event is lost
 * whenever an ad blocker or Safari drops it, and a Purchase is the one event
 * the ads optimise on.
 *
 * CONSENT TRAVELS WITH THE PURCHASE. The checkout records whether this person
 * allowed ads measurement at the moment they paid (and whether their browser
 * sent Global Privacy Control, which counts as no). Nothing is sent for anyone
 * who did not allow it, whatever this function is asked to do.
 *
 * What Meta receives: the event name, time, amount and currency, and a SHA-256
 * hash of the email address and the account id so it can match the purchase to
 * the ad. Plus the _fbp/_fbc browser ids and the browser's user agent and IP
 * as they were at checkout, which is what the pixel itself would have sent.
 * Never a song, a title, or anything from a board.
 *
 * Inert until META_CAPI_TOKEN is set (Events Manager, the songdrafts dataset,
 * Settings, generate access token).
 */

export const META_DATASET_ID = '1609391504053938'

export interface CapiContext {
  consent: boolean
  email?: string | null
  userId?: string | null
  fbp?: string | null
  fbc?: string | null
  clientIp?: string | null
  userAgent?: string | null
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Read the consent and browser ids the checkout stored in Stripe metadata. */
export function capiContextFromMetadata(
  metadata: Record<string, string> | null | undefined,
  extra: { email?: string | null; userId?: string | null } = {},
): CapiContext {
  return {
    consent: metadata?.ad_consent === '1',
    fbp: metadata?.fbp || null,
    fbc: metadata?.fbc || null,
    clientIp: metadata?.client_ip || null,
    userAgent: metadata?.client_ua || null,
    ...extra,
  }
}

export async function sendCapiEvent(
  ctx: CapiContext,
  event: {
    name: 'Purchase' | 'Retained'
    eventId: string
    time?: number
    value?: number
    currency?: string
    custom?: Record<string, string | number>
  },
): Promise<'sent' | 'no_consent' | 'not_configured' | 'failed'> {
  if (!ctx.consent) return 'no_consent'
  const token = Deno.env.get('META_CAPI_TOKEN')
  if (!token) return 'not_configured'

  const userData: Record<string, unknown> = {}
  if (ctx.email) userData.em = [await sha256(ctx.email)]
  if (ctx.userId) userData.external_id = [await sha256(ctx.userId)]
  if (ctx.fbp) userData.fbp = ctx.fbp
  if (ctx.fbc) userData.fbc = ctx.fbc
  if (ctx.clientIp) userData.client_ip_address = ctx.clientIp
  if (ctx.userAgent) userData.client_user_agent = ctx.userAgent

  const customData: Record<string, unknown> = { ...(event.custom ?? {}) }
  if (event.value != null) customData.value = event.value
  if (event.currency) customData.currency = event.currency.toUpperCase()

  const body = {
    data: [
      {
        event_name: event.name,
        event_time: event.time ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: 'website',
        event_source_url: 'https://www.songdrafts.com/app',
        user_data: userData,
        custom_data: customData,
      },
    ],
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${META_DATASET_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      console.error(`CAPI ${event.name} ${event.eventId} refused: ${await res.text()}`)
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    console.error(`CAPI ${event.name} ${event.eventId} failed: ${err instanceof Error ? err.message : err}`)
    return 'failed'
  }
}
