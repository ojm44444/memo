import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { playSongVersion } from '@/lib/playSongVersion'
import { usePlayerStore } from '@/stores/playerStore'
import { getSong } from '@/db/repositories/boardRepo'
import {
  deleteAudioVersion,
  renameAudioVersion,
  setPrimaryVersion,
} from '@/db/repositories/audioRepo'
import { exportSongVersion } from '@/lib/export/exportSongVersion'
import { scheduleFlush } from '@/sync/syncEngine'
import { CachedWaveform } from '@/components/audio/CachedWaveform'
import { cn } from '@/lib/cn'

interface AudioVersionStackProps {
  songId: string
  readOnly?: boolean
}

export function AudioVersionStack({ songId, readOnly = false }: AudioVersionStackProps) {
  const versions = useLiveQuery(
    () => db.audioVersions.where('songId').equals(songId).sortBy('sortOrder'),
    [songId],
  )
  const song = useLiveQuery(() => getSong(songId), [songId])
  const { currentVersionId, isPlaying, progress } = usePlayerStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')

  if (!song) return null

  const startRename = (versionId: string, label: string) => {
    setEditingId(versionId)
    setDraftLabel(label)
  }

  const saveRename = async (versionId: string) => {
    if (!draftLabel.trim()) {
      setEditingId(null)
      return
    }
    await renameAudioVersion(versionId, draftLabel)
    scheduleFlush()
    setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {versions?.map((version, i) => {
        const isActive = currentVersionId === version.id && isPlaying
        const isSecondary = i > 0
        const isPrimary = i === 0

        return (
          <div
            key={version.id}
            className={cn(
              'version-stack-item',
              isSecondary && !isActive && 'version-stack-item--muted',
              isActive && 'version-stack-item--active',
            )}
          >
            <button
              type="button"
              onClick={() => void playSongVersion(song.columnSlug, songId, version.id)}
              className="scp-audio-item w-full text-left"
            >
              <span
                className={cn(
                  'scp-play shrink-0',
                  !isActive && isSecondary && 'scp-play-muted',
                )}
              >
                ▶
              </span>
              <div className="min-w-0 flex-1">
                {editingId === version.id ? (
                  <input
                    className="version-stack-rename"
                    value={draftLabel}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onBlur={() => void saveRename(version.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename(version.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                ) : (
                  <div className="mb-1 truncate text-xs font-medium">
                    {version.label}
                    {isPrimary && <span className="version-stack-primary"> primary</span>}
                  </div>
                )}
                <CachedWaveform
                  versionId={version.id}
                  localBlobId={version.localBlobId}
                  storagePath={version.storagePath}
                  active={isActive}
                  progress={isActive ? progress : 0}
                  bars={32}
                  className="h-5"
                />
              </div>
              <span className="scp-dur shrink-0">{formatDuration(version.durationMs)}</span>
            </button>

            {!readOnly && (
              <div className="version-stack-actions">
                <button
                  type="button"
                  className="version-stack-action"
                  onClick={() => startRename(version.id, version.label)}
                >
                  Rename
                </button>
                {!isPrimary && (
                  <button
                    type="button"
                    className="version-stack-action"
                    onClick={() => {
                      void setPrimaryVersion(songId, version.id).then(() => scheduleFlush())
                    }}
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  className="version-stack-action"
                  onClick={() => void exportSongVersion(version.id)}
                >
                  Export
                </button>
                {(versions?.length ?? 0) > 1 && (
                  <button
                    type="button"
                    className="version-stack-action version-stack-action--danger"
                    onClick={() => {
                      if (!confirm(`Remove "${version.label}" from this song?`)) return
                      void deleteAudioVersion(version.id).then(() => scheduleFlush())
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {(versions?.length ?? 0) > 1 && (
        <span className="song-detail-label">
          {versions!.length} merged clips — tap to play any
        </span>
      )}
    </div>
  )
}
