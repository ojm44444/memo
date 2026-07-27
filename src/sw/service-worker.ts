/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { handleShareTargetPost } from './share-target'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  // Don't skip waiting here — let the update banner control activation.
  // Calling skipWaiting() on install causes old tabs to 404 on cached chunk
  // URLs after an update, which produces a white screen.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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

const handler = createHandlerBoundToURL('/index.html')
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
})
registerRoute(navigationRoute)

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
