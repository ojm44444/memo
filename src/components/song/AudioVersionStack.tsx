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
  setAudioVersionKind,
  setPrimaryVersion,
  updateAudioVersionTags,
  setAudioVersionTrimStart,
} from '@/db/repositories/audioRepo'
import { unlinkTake } from '@/db/repositories/boardRepo'
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
  /* Selectors rather than the whole store, so a change to something this list
     does not show (volume, the queue) does not re-render every waveform. */
  const currentVersionId = usePlayerStore((s) => s.currentVersionId)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore((s) => s.progress)
  const setProgress = usePlayerStore((s) => s.setProgress)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [tagEditingId, setTagEditingId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  /** Set when the menu was opened by a right-click: it opens where you clicked. */
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null)
  const [unlinked, setUnlinked] = useState<string | null>(null)
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
      if (e.key === 'Escape') {
        setMenuOpenId(null)
        setMenuPoint(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpenId])

  useEffect(() => {
    if (!unlinked) return
    const id = window.setTimeout(() => setUnlinked(null), 4000)
    return () => window.clearTimeout(id)
  }, [unlinked])

  // Hold the space a take will fill while the song and its takes load, so
  // the comments and fields below do not jump down when they arrive.
  if (!song || !versions) {
    return (
      <div className="sp-takes" aria-busy="true">
        <div className="sp-take-skeleton" />
      </div>
    )
  }

  const closeMenu = () => {
    setMenuOpenId(null)
    setMenuPoint(null)
  }

  const unlink = (versionId: string) => {
    closeMenu()
    void unlinkTake(versionId).then((landed) => {
      scheduleFlush()
      if (landed) setUnlinked(landed.title)
    })
  }

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
    <div className="sp-takes">
      {versions.map((version, i) => {
        const isCurrent = currentVersionId === version.id
        const isActive = isCurrent && isPlaying
        const isSecondary = i > 0
        const isPrimary = i === 0
        const menuOpen = menuOpenId === version.id
        const multipleClips = (versions?.length ?? 0) > 1

        return (
          <div
            key={version.id}
            onContextMenu={(e) => {
              // Right-click a take for its menu, Unlink first. Touch devices
              // reach the same menu from the ⋯ button.
              if (readOnly || editingId === version.id) return
              e.preventDefault()
              setMenuOpenId(version.id)
              setMenuPoint({ x: e.clientX, y: e.clientY })
            }}
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
                              title="Playback starts here. Clear via the ⋯ menu"
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
                      .map(c => ({ id: c.id, progress: c.timestampMs! / version.durationMs, label: c.body }))
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
                    onClick={() => {
                      setMenuPoint(null)
                      setMenuOpenId(menuOpen ? null : version.id)
                    }}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        className="version-menu-backdrop"
                        onClick={closeMenu}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          closeMenu()
                        }}
                      />
                      <div
                        className={cn('version-menu', menuPoint && 'version-menu--at-point')}
                        role="menu"
                        data-drawer-layer="take-menu"
                        style={
                          menuPoint
                            ? {
                                left: Math.max(8, Math.min(menuPoint.x, window.innerWidth - 200)),
                                top: Math.max(8, Math.min(menuPoint.y, window.innerHeight - 280)),
                              }
                            : undefined
                        }
                      >
                        {multipleClips && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item version-menu-item--lead"
                            title="Put this take back on its own card"
                            onClick={() => unlink(version.id)}
                          >
                            Unlink
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className="version-menu-item"
                          onClick={() => {
                            closeMenu()
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
                            closeMenu()
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
                              closeMenu()
                              void setPrimaryVersion(songId, version.id).then(() => scheduleFlush())
                            }}
                          >
                            Make primary
                          </button>
                        )}
                        {/* The whole Songwriting / Listen split, as one
                            control. Marking a take as a mix moves nothing and
                            copies no audio: it says this came back from a
                            producer, so it belongs in the room you play to the
                            band rather than the one where the bad takes live. */}
                        <button
                          type="button"
                          role="menuitem"
                          className="version-menu-item"
                          onClick={() => {
                            closeMenu()
                            const next = (version.kind ?? 'take') === 'take' ? 'mix' : 'take'
                            void setAudioVersionKind(version.id, next).then(() => scheduleFlush())
                          }}
                        >
                          {(version.kind ?? 'take') === 'take'
                            ? 'Mark as a mix'
                            : 'Move back to takes'}
                        </button>
                        {isCurrent && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item"
                            title="Start playback here every time"
                            onClick={() => {
                              closeMenu()
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
                              closeMenu()
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
                            closeMenu()
                            void exportSongVersion(version.id)
                          }}
                        >
                          Export
                        </button>
                        {multipleClips && (
                          <button
                            type="button"
                            role="menuitem"
                            className="version-menu-item version-menu-item--danger"
                            onClick={() => {
                              closeMenu()
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
      {unlinked && (
        <p className="sp-unlinked" role="status">
          Unlinked. "{unlinked}" is back on the board.
        </p>
      )}
    </div>
  )
}
