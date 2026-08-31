import {
  getFirstSyncError,
  getPendingHint,
  getPendingSyncCount,
} from '@/db/repositories/outboxRepo'
import { getBoardUserId } from '@/lib/auth/session'
import { isDevAuthBypass } from '@/lib/auth/devBypass'
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
let syncLoopTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveErrors = 0
const listeners = new Set<() => void>()

/**
 * How often to poll, and why it is not a fixed interval any more.
 *
 * It used to be setInterval(8s), unconditionally, for as long as the tab
 * existed. Each tick is a pull (three queries) plus a push, so a single tab
 * left open overnight was tens of thousands of requests to ask a question that
 * had the same answer every time. On a board only one person edits, which is
 * every board today, almost all of that is waste, and waste is metered.
 *
 * Two changes. A hidden tab does not poll at all: nobody is looking, local
 * edits still schedule their own flush, and becoming visible flushes
 * immediately. And a session that keeps finding nothing slows down, stepping
 * out to five minutes, snapping back to eight seconds the moment anything
 * actually happens.
 *
 * This is a cadence, not a correctness mechanism. Every real event still
 * flushes at once: a local edit, coming online, focusing the tab, a service
 * worker sync.
 */
const POLL_LADDER = [8_000, 15_000, 30_000, 60_000, 120_000, 300_000]
let quietFlushes = 0

function pollDelay(): number {
  return POLL_LADDER[Math.min(quietFlushes, POLL_LADDER.length - 1)]
}

/** Back to attentive. Called whenever something real happened. */
function resetPollCadence() {
  const wasSlow = quietFlushes > 0
  quietFlushes = 0
  if (wasSlow) scheduleNextPoll()
}

function scheduleNextPoll() {
  if (syncLoopTimer) clearTimeout(syncLoopTimer)
  if (!cloudSyncEnabled) return

  syncLoopTimer = setTimeout(() => {
    syncLoopTimer = null
    // A hidden tab is not worth a single request. visibilitychange flushes on
    // the way back, so nothing is missed, it just is not paid for meanwhile.
    if (navigator.onLine && !document.hidden) {
      void flush().finally(scheduleNextPoll)
    } else {
      scheduleNextPoll()
    }
  }, pollDelay())
}

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
    clearTimeout(syncLoopTimer)
    syncLoopTimer = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  if (!enabled) return

  quietFlushes = 0
  void flush().finally(scheduleNextPoll)
}

export async function flush() {
  if (flushPromise) return flushPromise

  flushPromise = (async () => {
    await refreshPendingCount()

    // Dev auth bypass: local-only board, never talk to Supabase.
    if (isDevAuthBypass()) {
      status = 'idle'
      lastError = null
      notify()
      return
    }

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
    let pulled = 0
    let pushResult = { pushed: 0, failed: 0, lastFailure: null as string | null }

    try {
      pulled = (await pullChanges(userId)).pulled
      const audio = await cachePendingRemoteAudio({ limit: 4 })
      if (audio.cached > 0) pulled += audio.cached
    } catch (err) {
      pullError = err instanceof Error ? err.message : 'Could not download updates'
    }

    try {
      pushResult = await pushChanges(userId)
    } catch (err) {
      pushResult = { pushed: 0, failed: 0, lastFailure: err instanceof Error ? err.message : 'Push failed' }
    }

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
      /**
       * A project that has been restricted will still be restricted in a
       * minute, and in an hour. Supabase says so in the body, and retrying a
       * refusal every sixty seconds for the days until the quota refills is
       * both pointless and, given the refusal is itself a response, not free.
       * Ten minutes between attempts is enough to notice it coming back.
       */
      const restricted = /egress|quota|restricted|402/i.test(
        `${lastError ?? ''} ${pullError ?? ''} ${pushResult.lastFailure ?? ''}`,
      )
      const ceiling = restricted ? 10 * 60_000 : 60_000
      const backoffMs = Math.min(4_000 * Math.pow(2, consecutiveErrors - 1), ceiling)
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

    /**
     * Did this round do anything? A round that pulled nothing, pushed nothing
     * and hit no error is the app asking a question it already knew the answer
     * to, and the next one can wait longer. Anything at all resets to
     * attentive, so a bandmate's change is never more than eight seconds
     * behind once the board is moving.
     */
    if (pulled > 0 || pushResult.pushed > 0 || hasError) {
      resetPollCadence()
    } else {
      quietFlushes++
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
  // A local edit means this session is active. Come back to attentive.
  resetPollCadence()

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
    resetPollCadence()
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
    if (document.visibilityState !== 'visible') return
    // Polling stopped while hidden, so pick it up again here.
    resetPollCadence()
    void flush()
    scheduleNextPoll()
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
