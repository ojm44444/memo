export const SHARE_IMPORT_CACHE = 'memo-share-import'
const SHARE_IMPORT_HANDLED_KEY = 'memo_share_import_handled'

export async function clearShareImportCache() {
  const cache = await caches.open(SHARE_IMPORT_CACHE)
  const requests = await cache.keys()
  await Promise.all(requests.map((request) => cache.delete(request)))
}

export async function consumeShareImport(): Promise<File[]> {
  const cache = await caches.open(SHARE_IMPORT_CACHE)
  const requests = await cache.keys()
  const files: File[] = []

  for (const request of requests) {
    const response = await cache.match(request)
    if (!response) continue
    const blob = await response.blob()
    const name = response.headers.get('x-filename') ?? 'shared-audio.m4a'
    const type = blob.type || response.headers.get('content-type') || 'audio/mp4'
    files.push(new File([blob], name, { type }))
  }

  await clearShareImportCache()
  return files
}

/** Retry briefly — SW redirect can race the app boot on cold PWA open. */
export async function consumeShareImportWithRetry(maxAttempts = 6): Promise<File[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const files = await consumeShareImport()
    if (files.length > 0) return files
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
  }
  return []
}

export function hasShareImportParam() {
  const params = new URLSearchParams(window.location.search)
  return params.get('share') === 'ready'
}

export function clearShareImportParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete('share')
  window.history.replaceState({}, '', url.pathname + url.search)
}

export function markShareImportHandled() {
  sessionStorage.setItem(SHARE_IMPORT_HANDLED_KEY, window.location.search)
}

export function isShareImportAlreadyHandled() {
  return sessionStorage.getItem(SHARE_IMPORT_HANDLED_KEY) === window.location.search
}

export function clearShareImportHandled() {
  sessionStorage.removeItem(SHARE_IMPORT_HANDLED_KEY)
}
