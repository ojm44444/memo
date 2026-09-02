/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { handleShareTargetPost } from './share-target'

declare let self: ServiceWorkerGlobalScope

/**
 * ACTIVATE IMMEDIATELY.
 *
 * This used to deliberately NOT skipWaiting, on the reasoning that swapping
 * the worker mid-session could 404 an old tab's chunk URLs and white-screen
 * it. The cost of that caution was far worse than the risk: a new build
 * installed, sat in "waiting", and the OLD worker kept answering every
 * navigation with the OLD index.html and therefore the OLD asset hashes.
 * Returning visitors were pinned to whatever build they first saw, through
 * any number of reloads, and a hard refresh does not help because the
 * refresh is served by the same blocked worker. Audited twice; both times
 * the live site was correct and the person looking at it could not see it.
 *
 * The 404 fear was also overstated: Vite asset filenames are content-hashed
 * and Vercel keeps previous deploys' assets served, so an old tab's chunk
 * request falls through to the network and resolves.
 */
self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge anything this build no longer owns, so a stale precache from a
      // previous version cannot answer for a page again.
      const keep = await caches.keys()
      await Promise.all(
        keep
          .filter((name) => name.startsWith('workbox-precache') === false && name.startsWith('sd-') === false)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'POST') return

  const url = new URL(request.url)
  if (url.pathname === '/app/import' || url.pathname.endsWith('/app/import')) {
    event.respondWith(handleShareTargetPost(request))
  }
})

/**
 * MARKETING ROUTES GO TO THE NETWORK FIRST.
 *
 * Every navigation used to be answered from the precached index.html, which
 * is right for the app (it has to open on a plane) and wrong for the landing
 * page, where being one deploy behind is the whole problem. The split is by
 * path: /app is offline-first because someone mid-idea on a train needs it
 * to open; /, /privacy, /terms and /sign-in are network-first with the cache
 * as the fallback, so a returning visitor sees the current site and an
 * offline one still sees something.
 *
 * 3s timeout: long enough for a slow connection, short enough that a dead
 * one falls back to cache rather than hanging on a white screen.
 */
const appShellHandler = createHandlerBoundToURL('/index.html')

registerRoute(
  new NavigationRoute(appShellHandler, {
    allowlist: [/^\/app(\/|$)/, /^\/share\//, /^\/playlist\//, /^\/invite\//],
    denylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
  }),
)

registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' && !/^\/(app|share|playlist|invite)(\/|$)/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'sd-pages-v1',
    networkTimeoutSeconds: 3,
  }),
)

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as Event & { tag: string; waitUntil: (p: Promise<void>) => void }
  if (syncEvent.tag === 'memo-sync') {
    syncEvent.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SYNC_FLUSH' }))
      }),
    )
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
