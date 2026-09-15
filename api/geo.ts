/**
 * Which consent rules apply to this visitor: the country Vercel's edge read
 * from their IP address, and nothing else.
 *
 * Used only to decide how the ads question is asked (see metaPixel.ts). The
 * UK and EU need a yes before anything from Meta loads; the US works on
 * opting out, with a "Your privacy choices" link and Global Privacy Control
 * honoured. Everywhere else, and whenever this cannot say, gets the banner.
 *
 * Nothing is stored or logged here, and only the two letter country code is
 * returned.
 */
export const config = { runtime: 'edge' }

export default function handler(request: Request): Response {
  const raw = request.headers.get('x-vercel-ip-country') ?? ''
  const country = /^[A-Z]{2}$/.test(raw) ? raw : null
  return new Response(JSON.stringify({ country }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
    },
  })
}
