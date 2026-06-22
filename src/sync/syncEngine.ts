import {
  getFirstSyncError,
  getPendingHint,
  getPendingSyncCount,
} from '@/db/repositories/outboxRepo'
import { getBoardUserId } from '@/lib/auth/session'
import { supabaseConfigured } from '@/lib/supabase/client'
import { cachePendingRemoteAudio } from './audioDownload'
import { pullChanges } from './pullChanges'
import { pushChanges } from './pushChanges'

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

let flushPromise: Promise<void> | null = null
let status: SyncStatus = 'idle'
let pendingCount = 0
let lastError: string | null = null
let cloudSyncEnabled = false
let syncLoopTimer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveErrors = 0
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncStatus() {
  return { status, pendingCount, online: navigator.onLine, lastError, cloudSyncEnabled }
}

async function getUserId() {
  return getBoardUserId()
}

export async function refreshPendingCount() {
  pendingCount = await getPendingSyncCount()
  notify()
}

export function setCloudSyncEnabled(enabled: boolean) {
  cloudSyncEnabled = enabled
  notify()

  if (syncLoopTimer) {
    clearInterval(syncLoopTimer)
    syncLoopTimer = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  if (!enabled) return

  void flush()

  syncLoopTimer = setInterval(() => {
    if (navigator.onLine) void flush()
  }, 8_000)
}

export async function flush() {
  if (flushPromise) return flushPromise

  flushPromise = (async () => {
    await refreshPendingCount()

    if (!navigator.onLine) {
      status = 'offline'
      lastError = null
      notify()
      return
    }

    const userId = await getUserId()
    if (!userId) {
      status = pendingCount > 0 ? 'error' : 'idle'
      lastError = pendingCount > 0 ? 'Sign in to sync to cloud' : null
      notify()
      return
    }

    if (!supabaseConfigured) {
      status = pendingCount > 0 ? 'error' : 'idle'
      lastError = pendingCount > 0 ? 'Cloud sync is not configured' : null
      notify()
      return
    }

    status = 'syncing'
    lastError = null
    notify()

    let pullError: string | null = null
    let pushResult = { pushed: 0, failed: 0, lastFailure: null as string | null }

    try {
      await pullChanges(userId)
      void cachePendingRemoteAudio({ limit: 4 })
    } catch (err) {
      pullError = err instanceof Error ? err.message : 'Could not download updates'
    }

    pushResult = await pushChanges(userId)

    await refreshPendingCount()

    const itemError = await getFirstSyncError()
    const pendingHint = await getPendingHint()

    const hasError = pendingCount > 0 || pullError || pushResult.lastFailure
    if (pendingCount > 0) {
      status = 'error'
      lastError = itemError ?? pushResult.lastFailure ?? pullError ?? pendingHint
    } else if (pullError || pushResult.lastFailure) {
      status = 'error'
      lastError = pushResult.lastFailure ?? pullError
    } else {
      status = 'idle'
      lastError = null
    }

    if (hasError && cloudSyncEnabled && navigator.onLine) {
      consecutiveErrors++
      const backoffMs = Math.min(4_000 * Math.pow(2, consecutiveErrors - 1), 60_000)
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (cloudSyncEnabled && navigator.onLine) void flush()
      }, backoffMs)
    } else {
      consecutiveErrors = 0
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    notify()
  })().finally(() => {
    flushPromise = null
  })

  return flushPromise
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleFlush() {
  void refreshPendingCount()

  if (cloudSyncEnabled && navigator.onLine) {
    void flush()
    return
  }

  if (!navigator.onLine && cloudSyncEnabled) {
    status = 'offline'
    lastError = null
    notify()
  }

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void flush()
  }, 800)
}

let engineInitialized = false

export function initSyncEngine() {
  void refreshPendingCount()

  if (engineInitialized) return
  engineInitialized = true

  window.addEventListener('online', () => {
    consecutiveErrors = 0
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    void flush()
  })

  window.addEventListener('offline', () => {
    status = 'offline'
    notify()
  })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_FLUSH') void flush()
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })

  window.addEventListener('focus', () => void flush())
}

export async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  if ('sync' in registration) {
    try {
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('memo-sync')
    } catch {
      // Background Sync not supported (e.g. iOS Safari)
    }
  }
}
