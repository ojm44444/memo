import { useEffect, useState } from 'react'
import { flush, getSyncStatus, subscribeSync } from '@/sync/syncEngine'
import { cn } from '@/lib/cn'

export function SyncStatusBadge() {
  const [state, setState] = useState(getSyncStatus())

  useEffect(() => {
    const unsubscribe = subscribeSync(() => setState(getSyncStatus()))
    return () => {
      unsubscribe()
    }
  }, [])

  const offline = !state.online
  const synced = !offline && state.pendingCount === 0 && state.status === 'idle'

  const isUploading = state.status === 'syncing' && state.pendingCount > 0

  const label = offline
    ? state.pendingCount > 0
      ? `Offline · ${state.pendingCount} saved locally`
      : 'Offline'
    : isUploading
      ? 'Uploading…'
      : state.status === 'error'
        ? state.lastError ?? 'Sync failed'
        : state.pendingCount > 0
          ? `${state.pendingCount} pending`
          : state.cloudSyncEnabled
            ? 'In cloud'
            : 'Sign in to sync'

  return (
    <button
      type="button"
      className={cn(
        'sync-status-badge',
        synced
          ? 'sync-status-badge--ok'
          : offline
            ? 'sync-status-badge--warn'
            : state.status === 'error'
              ? 'sync-status-badge--error'
              : 'sync-status-badge--warn',
      )}
      title={state.lastError ? `${state.lastError}\n\nTap to retry sync` : 'Tap to sync now'}
      onClick={() => void flush()}
    >
      <span
        className={cn(
          'sync-status-dot',
          synced ? 'sync-status-dot--ok' : state.status === 'error' ? 'sync-status-dot--error' : 'sync-status-dot--warn',
        )}
      />
      <span className="sync-status-label">{label}</span>
    </button>
  )
}
