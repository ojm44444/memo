import { useEffect, useState } from 'react'
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
import { unmergeSong } from '@/db/repositories/boardRepo'
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
  const { currentVersionId, isPlaying, progress, setProgress, setPlaying } = usePlayerStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [tagEditingId, setTagEditingId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
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

  // Close the row menu on Escape
  useEffect(() => {
    if (!menuOpenId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpenId])

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
        const isCurrent = currentVersionId === version.id
        const isActive = isCurrent && isPlaying
        const isSecondary = i > 0
        const isPrimary = i === 0
        const menuOpen = menuOpenId === version.id
        const multipleClips = (versions?.length ?? 0) > 1

        return (
          <div
            key={version.id}
            className={cn(
              'version-stack-item',
              isSecondary && !isCurrent && 'version-stack-item--muted',
              isCurrent && !isActive && 'version-stack-item--current',
              isActive && 'version-stack-item--active',
            )}
          >
            <div className="version-row">
              <button
                type="button"
                onClick={() => {
                  // If already the current clip, just toggle play/pause
                  if (isCurrent) {
                    setPlaying(!isPlaying)
                    return
                  }
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
                    !isCurrent && isSecondary && 'scp-play-muted',
                  )}
                >
                  {isActive ? '❚❚' : '▶'}
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
                      return showLabel || (isPrimary && multipleClips) || version.trimStartMs ? (
                        <div className="version-row-meta">
                          {showLabel && <span className="version-row-label">{version.label}</span>}
                          {isPrimary && multipleClips && (
                            <span className="version-stack-primary">primary</span>
                          )}
                          {version.trimStartMs ? (
                            <span
                              className="version-trim-chip"
                              title="Playback starts here — clear via ⋯ menu"
                            >
                              ▷ {(version.trimStartMs / 1000).toFixed(1)}s
                            </span>
                          ) : null}
                        </div>
                      ) : null
                    })()
                  )}
                  <InteractiveWaveform
                    audioUrl={audioUrls[version.id] ?? null}
                    cacheKey={version.id}
                    progress={isCurrent ? progress : 0}
                    active={isActive}
                    height={isCurrent ? 64 : 24}
                    markers={(comments ?? [])
                      .filter(c => c.timestampMs != null && version.durationMs > 0)
                      .map(c => ({ id: c.id, progress: c.timestampMs! / version.durationMs }))
                    }
                    onSeek={(fraction) => {
                      const ms = fraction * (version.durationMs || 0)
                      if (isCurrent) {
                        // Seek without restarting whether playing or paused
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

              {!readOnly && (
                <div className="version-menu-anchor">
                  <button
                    type="button"
                    className={cn('version-kebab', menuOpen && 'is-open')}
                    aria-label={`Options for ${version.label}`}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpenId(menuOpen ? null : version.id)}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        className="version-menu-backdrop"
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div className="version-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="version-menu-item"
                          onClick={() => {
                            setMenuOpenId(null)
                            startRename(version.id, version.label)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="version-menu-item"
                          onClick={() => {
                            setMenuOpenId(null)
                            setTagEditingId(version.id)
                            setTagDraft('')
                          }}
                        >
                          Add tag
                        </button>
                        {!isPrimary && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item"
                            onClick={() => {
                              setMenuOpenId(null)
                              void setPrimaryVersion(songId, version.id).then(() => scheduleFlush())
                            }}
                          >
                            Make primary
                          </button>
                        )}
                        {isCurrent && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item"
                            title="Start playback here every time"
                            onClick={() => {
                              setMenuOpenId(null)
                              const ms = Math.round(progress * version.durationMs)
                              void setAudioVersionTrimStart(version.id, ms > 1000 ? ms : null)
                            }}
                          >
                            {version.trimStartMs ? 'Move start point here' : 'Set start point here'}
                          </button>
                        )}
                        {version.trimStartMs ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item"
                            onClick={() => {
                              setMenuOpenId(null)
                              void setAudioVersionTrimStart(version.id, null)
                            }}
                          >
                            Clear start point
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          className="version-menu-item"
                          onClick={() => {
                            setMenuOpenId(null)
                            void exportSongVersion(version.id)
                          }}
                        >
                          Export
                        </button>
                        {multipleClips && isSecondary && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item"
                            title="Move this clip to its own song card"
                            onClick={() => {
                              setMenuOpenId(null)
                              void unmergeSong(version.id).then(() => scheduleFlush())
                            }}
                          >
                            Split into own song
                          </button>
                        )}
                        {multipleClips && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item version-menu-item--danger"
                            onClick={() => {
                              setMenuOpenId(null)
                              if (!confirm(`Remove "${version.label}" from this song?`)) return
                              void deleteAudioVersion(version.id).then(() => scheduleFlush())
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

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
          </div>
        )
      })}
    </div>
  )
}
