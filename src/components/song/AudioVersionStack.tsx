import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { playSongVersion } from '@/lib/playSongVersion'
import { playSongAtTimestamp } from '@/lib/playSongVersion'
import { playAudioImmediately, unlockAudioEl, seekAudioTo } from '@/lib/audio/globalAudioEl'
import { getCachedUrl, resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { getSong } from '@/db/repositories/boardRepo'
import { getCommentsForSong } from '@/db/repositories/commentRepo'
import {
  deleteAudioVersion,
  renameAudioVersion,
  setPrimaryVersion,
  updateAudioVersionTags,
  setAudioVersionTrimStart,
} from '@/db/repositories/audioRepo'
import { exportSongVersion } from '@/lib/export/exportSongVersion'
import { scheduleFlush } from '@/sync/syncEngine'
import { InteractiveWaveform } from '@/components/audio/InteractiveWaveform'
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
  const comments = useLiveQuery(() => getCommentsForSong(songId), [songId])
  const { currentVersionId, isPlaying, progress, setProgress } = usePlayerStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [tagEditingId, setTagEditingId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})

  // Resolve audio URLs so InteractiveWaveform can decode peaks
  useLiveQuery(async () => {
    if (!versions) return
    const entries = await Promise.all(
      versions.map(async (v) => {
        const url = await resolvePlaybackUrl(v.localBlobId, v.storagePath)
        return [v.id, url] as const
      })
    )
    setAudioUrls(Object.fromEntries(entries.filter(([, url]) => url != null) as [string, string][]))
  }, [versions?.map(v => v.id).join(',')])

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
              onClick={() => {
                // If the URL is already cached, play instantly in the gesture
                // handler before any await — this is the only way to guarantee
                // iOS allows audio.play() without a second tap.
                const cachedUrl = getCachedUrl(version.localBlobId, version.storagePath)
                const rate = usePlayerStore.getState().playbackRate
                if (cachedUrl) {
                  playAudioImmediately(cachedUrl, rate)
                } else {
                  // First load — keep gesture alive for the async play path
                  unlockAudioEl()
                }
                void playSongVersion(song.columnSlug, songId, version.id)
              }}
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
                  (() => {
                    // Hide redundant label: only one clip, or label matches song title
                    const labelMatchesTitle =
                      version.label.toLowerCase().trim() === song.title.toLowerCase().trim()
                    const onlyOneClip = (versions?.length ?? 0) <= 1
                    const showLabel = !onlyOneClip && !labelMatchesTitle
                    return showLabel ? (
                      <div className="mb-1 truncate text-xs font-medium">
                        {version.label}
                        {isPrimary && versions!.length > 1 && (
                          <span className="version-stack-primary"> primary</span>
                        )}
                      </div>
                    ) : null
                  })()
                )}
                <InteractiveWaveform
                  audioUrl={audioUrls[version.id] ?? null}
                  progress={isActive ? progress : 0}
                  active={isActive}
                  barCount={32}
                  height={20}
                  markers={(comments ?? [])
                    .filter(c => c.timestampMs != null && version.durationMs > 0)
                    .map(c => ({ id: c.id, progress: c.timestampMs! / version.durationMs }))}
                  onSeek={(fraction) => {
                    const ms = fraction * (version.durationMs || 0)
                    if (isActive) {
                      seekAudioTo(ms)
                      setProgress(fraction)
                    } else {
                      const cachedUrl = getCachedUrl(version.localBlobId, version.storagePath)
                      if (cachedUrl) playAudioImmediately(cachedUrl, usePlayerStore.getState().playbackRate)
                      else unlockAudioEl()
                      void playSongAtTimestamp(song.columnSlug, songId, version.id, ms)
                    }
                  }}
                />
              </div>
              <span className="scp-dur shrink-0">{formatDuration(version.durationMs)}</span>
            </button>

            {/* Per-clip tags */}
            {(version.tags && version.tags.length > 0) || tagEditingId === version.id ? (
              <div className="version-clip-tags">
                {version.tags?.map((tag) => (
                  <span key={tag} className="version-clip-tag">
                    {tag}
                    {!readOnly && (
                      <button
                        type="button"
                        className="version-clip-tag-remove"
                        onClick={() => {
                          const next = (version.tags ?? []).filter((t) => t !== tag)
                          void updateAudioVersionTags(version.id, next)
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {tagEditingId === version.id && (() => {
                  // Song-level tags that aren't already on this clip
                  const available = (song?.tags ?? []).filter(
                    (t) => !(version.tags ?? []).includes(t)
                  )
                  const addTag = (t: string) => {
                    void updateAudioVersionTags(version.id, [...(version.tags ?? []), t])
                    setTagEditingId(null)
                    setTagDraft('')
                  }
                  return (
                    <div className="version-clip-tag-picker">
                      {available.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="version-clip-tag-pick-btn"
                          onMouseDown={(e) => { e.preventDefault(); addTag(t) }}
                        >
                          {t}
                        </button>
                      ))}
                      <input
                        className="version-clip-tag-input"
                        placeholder="or type new…"
                        value={tagDraft}
                        autoFocus
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && tagDraft.trim()) {
                            addTag(tagDraft.trim())
                          }
                          if (e.key === 'Escape') { setTagEditingId(null); setTagDraft('') }
                        }}
                        onBlur={() => { setTagEditingId(null); setTagDraft('') }}
                      />
                    </div>
                  )
                })()}
              </div>
            ) : null}

            {!readOnly && (
              <div className="version-stack-actions">
                <button
                  type="button"
                  className="version-stack-action"
                  onClick={() => startRename(version.id, version.label)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="version-stack-action"
                  onClick={() => { setTagEditingId(version.id); setTagDraft('') }}
                >
                  + Tag
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
                {/* Trim start: capture current playback position when this clip is active */}
                {currentVersionId === version.id ? (
                  <button
                    type="button"
                    className="version-stack-action version-stack-action--trim"
                    onClick={() => {
                      const ms = Math.round(progress * version.durationMs)
                      void setAudioVersionTrimStart(version.id, ms > 1000 ? ms : null)
                    }}
                    title="Start playback here every time"
                  >
                    {version.trimStartMs
                      ? `▷ from ${(version.trimStartMs / 1000).toFixed(1)}s`
                      : '▷ Set start'}
                  </button>
                ) : version.trimStartMs ? (
                  <button
                    type="button"
                    className="version-stack-action version-stack-action--trim"
                    onClick={() => void setAudioVersionTrimStart(version.id, null)}
                    title="Clear start point"
                  >
                    ▷ {(version.trimStartMs / 1000).toFixed(1)}s ×
                  </button>
                ) : null}
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
