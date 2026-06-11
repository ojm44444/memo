import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  createSongShare,
  listSongShareFeedback,
  listSongShares,
  renewSongShare,
  revokeAllSongShares,
  revokeSongShare,
  updateSongShareLabel,
  shareUrlFromToken,
  type SongShareFeedbackComment,
  type SongShareRow,
} from '@/db/repositories/shareRepo'
import { getSong } from '@/db/repositories/boardRepo'
import { getActiveProjectId, getProjectAccentHue } from '@/db/repositories/projectRepo'
import { projectAccentStyle } from '@/lib/projectAccent'
import { refreshShareFeedbackCache } from '@/db/repositories/shareFeedbackRepo'
import { formatDuration } from '@/lib/audio-utils'
import { playSongAtTimestamp } from '@/lib/playSongVersion'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { countExpiringShares, formatShareExpiry, getShareExpiryStatus } from '@/lib/shareExpiry'
import { getPendingUploadsForSong } from '@/db/repositories/outboxRepo'
import { flush } from '@/sync/syncEngine'

interface SongSharePanelProps {
  songId: string
}

export function SongSharePanel({ songId }: SongSharePanelProps) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [shareLabel, setShareLabel] = useState('')
  const [allowDownload, setAllowDownload] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [shares, setShares] = useState<SongShareRow[]>([])
  const [feedback, setFeedback] = useState<SongShareFeedbackComment[]>([])
  const [loading, setLoading] = useState(false)
  const [shareVersionId, setShareVersionId] = useState<string | null>(null)
  const [shareLabelFilter, setShareLabelFilter] = useState<string | null>(null)
  const [shareSort, setShareSort] = useState<'newest' | 'oldest' | 'plays' | 'label'>('newest')
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrCopied, setQrCopied] = useState(false)

  const song = useLiveQuery(() => getSong(songId), [songId])
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )

  const versions = useLiveQuery(
    () => db.audioVersions.where('songId').equals(songId).sortBy('sortOrder'),
    [songId],
  )

  const cloudVersions = useMemo(
    () => versions?.filter((version) => version.storagePath) ?? [],
    [versions],
  )
  const primaryVersion = versions?.[0]
  const effectiveShareVersionId =
    shareVersionId && cloudVersions.some((version) => version.id === shareVersionId)
      ? shareVersionId
      : (cloudVersions[0]?.id ?? null)
  const selectedVersion =
    cloudVersions.find((version) => version.id === effectiveShareVersionId) ??
    cloudVersions[0] ??
    primaryVersion

  const hasCloudAudio = cloudVersions.length > 0
  const pendingUploads = useLiveQuery(() => getPendingUploadsForSong(songId), [songId])
  const uploadsPending = (pendingUploads?.length ?? 0) > 0

  useEffect(() => {
    if (!cloudVersions.length) {
      setShareVersionId(null)
      return
    }
    if (!shareVersionId || !cloudVersions.some((version) => version.id === shareVersionId)) {
      setShareVersionId(cloudVersions[0].id)
    }
  }, [versions, shareVersionId, cloudVersions])

  const loadShareData = useCallback(async () => {
    setLoading(true)
    try {
      const [shareRows, feedbackRows] = await Promise.all([
        listSongShares(songId),
        listSongShareFeedback(songId),
      ])
      setShares(shareRows)
      setFeedback(feedbackRows)
      await refreshShareFeedbackCache([songId])
    } catch {
      setShares([])
      setFeedback([])
    } finally {
      setLoading(false)
    }
  }, [songId])

  useEffect(() => {
    if (open) void loadShareData()
  }, [open, loadShareData])

  const openShareQr = async (token: string) => {
    try {
      const url = shareUrlFromToken(token)
      const dataUrl = await QRCode.toDataURL(url, {
        width: 180,
        margin: 1,
        color: { dark: '#e8e8e8', light: '#12141a' },
      })
      setQrToken(token)
      setQrDataUrl(dataUrl)
    } catch {
      setError('Could not generate QR code')
    }
  }

  const closeShareQr = () => {
    setQrToken(null)
    setQrDataUrl(null)
    setQrCopied(false)
  }

  useEffect(() => {
    if (!qrToken) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeShareQr()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [qrToken])

  const copyShareQr = async () => {
    if (!qrDataUrl) return
    try {
      const response = await fetch(qrDataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setQrCopied(true)
      setTimeout(() => setQrCopied(false), 2500)
    } catch {
      setError('Could not copy QR image — try Download PNG instead')
    }
  }

  const downloadShareQr = () => {
    if (!qrDataUrl || !qrToken) return
    const anchor = document.createElement('a')
    anchor.href = qrDataUrl
    anchor.download = `memo-share-qr-${qrToken.slice(0, 8)}.png`
    anchor.click()
  }

  const copyLink = async (token: string) => {
    const url = shareUrlFromToken(token)
    await navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2500)
  }

  const createLink = async () => {
    setBusy(true)
    setError(null)
    try {
      if (!hasCloudAudio) {
        throw new Error('Upload to cloud first — stay online until the badge says In cloud')
      }
      const url = await createSongShare(songId, {
        allowDownload,
        password: password.trim() || undefined,
        versionId: selectedVersion?.id,
        label: shareLabel.trim() || undefined,
      })
      await navigator.clipboard.writeText(url)
      const token = url.split('/').pop() ?? null
      if (token) setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2500)
      await loadShareData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create share link')
    } finally {
      setBusy(false)
    }
  }

  const revokeLink = async (token: string) => {
    await revokeSongShare(token)
    await loadShareData()
  }

  const revokeAllLinks = async () => {
    if (shares.length === 0) return
    if (!confirm(`Revoke all ${shares.length} active link${shares.length === 1 ? '' : 's'}?`)) return

    setBusy(true)
    try {
      await revokeAllSongShares(songId)
      await loadShareData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke links')
    } finally {
      setBusy(false)
    }
  }

  const renewLink = async (token: string) => {
    await renewSongShare(token)
    await loadShareData()
  }

  const saveLabel = async (token: string, label: string) => {
    await updateSongShareLabel(token, label)
    await loadShareData()
  }

  const expiringCount = countExpiringShares(shares)

  const shareLabelOptions = useMemo(() => {
    const labels = new Set<string>()
    for (const share of shares) {
      const label = share.label?.trim()
      if (label) labels.add(label)
    }
    return [...labels].sort((a, b) => a.localeCompare(b))
  }, [shares])

  const filteredShares = useMemo(() => {
    if (!shareLabelFilter) return shares
    const needle = shareLabelFilter.toLowerCase()
    return shares.filter((share) => (share.label ?? '').toLowerCase() === needle)
  }, [shares, shareLabelFilter])

  const sortedShares = useMemo(() => {
    const list = [...filteredShares]
    switch (shareSort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at))
      case 'plays':
        return list.sort(
          (a, b) =>
            (b.listen_count ?? 0) - (a.listen_count ?? 0) ||
            b.created_at.localeCompare(a.created_at),
        )
      case 'label':
        return list.sort(
          (a, b) =>
            (a.label ?? '').localeCompare(b.label ?? '') || b.created_at.localeCompare(a.created_at),
        )
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
  }, [filteredShares, shareSort])

  const shareStatsSummary = useMemo(() => {
    const linkCount = sortedShares.length
    const viewCount = sortedShares.reduce((sum, share) => sum + (share.view_count ?? 0), 0)
    const playCount = sortedShares.reduce((sum, share) => sum + (share.listen_count ?? 0), 0)
    const feedbackCount = feedback.length
    return { linkCount, viewCount, playCount, feedbackCount }
  }, [sortedShares, feedback])

  const copyAllLinks = async () => {
    if (sortedShares.length === 0) return
    const urls = sortedShares.map((share) => shareUrlFromToken(share.token)).join('\n')
    await navigator.clipboard.writeText(urls)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2500)
  }

  const exportShareLinksCsv = () => {
    if (sortedShares.length === 0) return

    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = [
      ['label', 'url', 'created', 'plays', 'views', 'expires'],
      ...sortedShares.map((share) => [
        share.label ?? '',
        shareUrlFromToken(share.token),
        share.created_at,
        String(share.listen_count ?? 0),
        String(share.view_count ?? 0),
        share.expires_at ?? '',
      ]),
    ]

    const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    const filterSlug = shareLabelFilter
      ? shareLabelFilter.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
      : ''
    anchor.download = filterSlug
      ? `memo-shares-${filterSlug}-${songId.slice(0, 8)}.csv`
      : `memo-shares-${songId.slice(0, 8)}.csv`
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  const showBulkShareActions = shares.length > 1 || (shareLabelFilter !== null && sortedShares.length > 0)
  const copyAllLabel = shareLabelFilter ? 'Copy filtered' : 'Copy all'
  const exportCsvLabel = shareLabelFilter ? 'Export filtered' : 'Export CSV'

  useEffect(() => {
    if (shareLabelFilter && !shareLabelOptions.includes(shareLabelFilter)) {
      setShareLabelFilter(null)
    }
  }, [shareLabelFilter, shareLabelOptions])

  const playFeedbackAt = async (timestampMs: number) => {
    if (!selectedVersion) return
    const song = await getSong(songId)
    if (!song) return
    await playSongAtTimestamp(song.columnSlug, songId, selectedVersion.id, timestampMs)
  }

  return (
    <div className="song-share">
      <button type="button" className="song-share-trigger" onClick={() => setOpen((v) => !v)}>
        Share demo link
        {(shares.length > 0 || feedback.length > 0) && (
          <span className="song-share-badge">{Math.max(shares.length, feedback.length)}</span>
        )}
      </button>

      {open && (
        <div className="song-share-panel">
          <p className="song-share-sub">
            Anyone with the link can listen in their browser — no mem• account needed.
          </p>

          {cloudVersions.length > 1 && (
            <label className="song-share-field">
              <span>Version to share</span>
              <select
                className="song-share-input"
                value={effectiveShareVersionId ?? ''}
                onChange={(e) => setShareVersionId(e.target.value)}
              >
                {cloudVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.label} · {formatDuration(version.durationMs)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="song-share-field">
            <span>Label (optional)</span>
            <input
              type="text"
              className="song-share-input"
              placeholder="Band feedback, label A&R…"
              value={shareLabel}
              onChange={(e) => setShareLabel(e.target.value)}
            />
          </label>

          <label className="song-share-field">
            <span>Password (optional)</span>
            <input
              type="text"
              className="song-share-input"
              placeholder="Leave blank for open link"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <label className="song-share-check">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
            />
            Allow download
          </label>

          <button
            type="button"
            className="song-share-create"
            disabled={busy || !hasCloudAudio}
            onClick={() => void createLink()}
          >
            {busy ? 'Creating…' : 'Create & copy link'}
          </button>

          {uploadsPending && (
            <div className="song-share-uploading">
              <p className="song-share-hint">
                Uploading {pendingUploads!.length} clip{pendingUploads!.length === 1 ? '' : 's'} to
                cloud…
              </p>
              <button type="button" className="song-share-refresh" onClick={() => void flush()}>
                Retry sync
              </button>
            </div>
          )}

          {!hasCloudAudio && !uploadsPending && (
            <p className="song-share-hint">Song must be in the cloud before sharing. Stay online.</p>
          )}

          {error && <p className="song-share-error">{error}</p>}

          {expiringCount > 0 && (
            <p className="song-share-expiry-warning">
              {expiringCount} link{expiringCount === 1 ? '' : 's'} expire
              {expiringCount === 1 ? 's' : ''} within a week — create a fresh link if you still need
              feedback.
            </p>
          )}

          {shares.length > 0 && (
            <div className="song-share-active">
              <div className="song-share-active-header">
                <div className="song-share-active-toolbar">
                  <span className="song-detail-label">Active links</span>
                  <div className="song-share-active-toolbar-actions">
                    {showBulkShareActions && sortedShares.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="song-share-copy-all"
                          onClick={() => void copyAllLinks()}
                        >
                          {copiedAll ? 'Copied!' : copyAllLabel}
                        </button>
                        <button
                          type="button"
                          className="song-share-export-csv"
                          onClick={() => exportShareLinksCsv()}
                        >
                          {exportCsvLabel}
                        </button>
                      </>
                    )}
                    {shares.length > 1 && (
                      <button
                        type="button"
                        className="song-share-revoke-all"
                        disabled={busy}
                        onClick={() => void revokeAllLinks()}
                      >
                        Revoke all
                      </button>
                    )}
                  <label className="song-share-sort-label">
                    Sort
                    <select
                      className="song-share-sort"
                      value={shareSort}
                      onChange={(event) =>
                        setShareSort(event.target.value as typeof shareSort)
                      }
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="plays">Most plays</option>
                      <option value="label">Label</option>
                    </select>
                  </label>
                  </div>
                </div>
                <p className="song-share-stats-summary">
                  {shareStatsSummary.linkCount} link
                  {shareStatsSummary.linkCount === 1 ? '' : 's'}
                  {shareLabelFilter ? ` matching “${shareLabelFilter}”` : ''}
                  {' · '}
                  {shareStatsSummary.viewCount} open{shareStatsSummary.viewCount === 1 ? '' : 's'}
                  {' · '}
                  {shareStatsSummary.playCount} play{shareStatsSummary.playCount === 1 ? '' : 's'}
                  {' · '}
                  {shareStatsSummary.feedbackCount} comment
                  {shareStatsSummary.feedbackCount === 1 ? '' : 's'}
                </p>
                {shareLabelOptions.length > 0 && (
                  <div className="song-share-label-filters" role="group" aria-label="Filter by label">
                    <button
                      type="button"
                      className={
                        shareLabelFilter === null
                          ? 'song-share-label-filter is-active'
                          : 'song-share-label-filter'
                      }
                      onClick={() => setShareLabelFilter(null)}
                    >
                      All
                    </button>
                    {shareLabelOptions.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className={
                          shareLabelFilter === label
                            ? 'song-share-label-filter is-active'
                            : 'song-share-label-filter'
                        }
                        onClick={() => setShareLabelFilter(label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {shareLabelFilter && filteredShares.length === 0 && (
                <p className="song-share-hint">No links with label “{shareLabelFilter}”.</p>
              )}
              <ul className="song-share-active-list">
                {sortedShares.map((share) => {
                  const url = shareUrlFromToken(share.token)
                  const expiryStatus = getShareExpiryStatus(share.expires_at)
                  return (
                    <li
                      key={share.id}
                      className={
                        expiryStatus === 'expired' || expiryStatus === 'soon'
                          ? `song-share-active-item is-expiry-${expiryStatus}`
                          : 'song-share-active-item'
                      }
                    >
                      <div className="song-share-active-meta">
                        <div className="song-share-active-meta-primary">
                          <input
                            type="text"
                            className="song-share-label-input"
                            placeholder="Add label…"
                            defaultValue={share.label ?? ''}
                            onBlur={(event) => {
                              const next = event.target.value.trim()
                              if (next === (share.label ?? '')) return
                              void saveLabel(share.token, next)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                          />
                          <span className="song-share-active-date">
                            <span className="song-share-active-date-label">Created</span>
                            <span className="song-share-active-date-label-sr">Created </span>
                            {new Date(share.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {((share.password_required ||
                          share.allow_download ||
                          formatShareExpiry(share.expires_at)) ||
                          (share.view_count ?? 0) > 0 ||
                          (share.listen_count ?? 0) > 0 ||
                          share.last_viewed_at ||
                          share.last_listened_at) && (
                          <div className="song-share-active-meta-badges">
                            {(share.password_required ||
                              share.allow_download ||
                              formatShareExpiry(share.expires_at)) && (
                              <div
                                className="song-share-active-badges"
                                role="group"
                                aria-label="Link options"
                              >
                                {share.password_required && (
                                  <span className="song-share-active-tag is-password">Password</span>
                                )}
                                {share.allow_download && (
                                  <span className="song-share-active-tag">Download</span>
                                )}
                                {formatShareExpiry(share.expires_at) && (
                                  <span
                                    className={
                                      expiryStatus === 'soon' || expiryStatus === 'expired'
                                        ? `song-share-active-tag is-expiry-${expiryStatus}`
                                        : 'song-share-active-tag'
                                    }
                                  >
                                    {formatShareExpiry(share.expires_at)}
                                  </span>
                                )}
                              </div>
                            )}
                            {((share.view_count ?? 0) > 0 ||
                              (share.listen_count ?? 0) > 0 ||
                              share.last_viewed_at ||
                              share.last_listened_at) && (
                              <div
                                className="song-share-active-badges is-stats"
                                role="group"
                                aria-label="Link activity"
                              >
                                {(share.view_count ?? 0) > 0 && (
                                  <span className="song-share-active-tag">
                                    {share.view_count} open{share.view_count === 1 ? '' : 's'}
                                  </span>
                                )}
                                {(share.listen_count ?? 0) > 0 && (
                                  <span className="song-share-active-tag">
                                    {share.listen_count} play{share.listen_count === 1 ? '' : 's'}
                                  </span>
                                )}
                                {share.last_viewed_at && (
                                  <span className="song-share-active-tag">
                                    Last opened {formatRelativeTime(share.last_viewed_at)}
                                  </span>
                                )}
                                {share.last_listened_at && (
                                  <span className="song-share-active-tag">
                                    Last played {formatRelativeTime(share.last_listened_at)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="song-share-preview">
                        <div className="song-share-preview-main">
                          <div
                            className="song-share-preview-art"
                            style={
                              activeProjectId
                                ? projectAccentStyle(activeProjectId, accentHue ?? null)
                                : undefined
                            }
                            aria-hidden
                          />
                          <div className="song-share-preview-body">
                            <div className="song-share-preview-head">
                              <span className="song-share-preview-site">{window.location.host}</span>
                              <div className="song-share-preview-badges">
                                {share.password_required && (
                                  <span className="song-share-preview-badge is-password">Password</span>
                                )}
                                {share.allow_download && (
                                  <span className="song-share-preview-badge">Download</span>
                                )}
                              </div>
                            </div>
                            <span className="song-share-preview-title">
                              {song?.title || 'Untitled'}
                            </span>
                            {share.label ? (
                              <span className="song-share-preview-label">{share.label}</span>
                            ) : null}
                            <span className="song-share-preview-desc">
                              {share.label ? 'Shared demo link' : 'Listen on mem•'}
                            </span>
                            {((share.view_count ?? 0) > 0 || (share.listen_count ?? 0) > 0) && (
                              <span className="song-share-preview-meta">
                                {(share.view_count ?? 0) > 0 &&
                                  `${share.view_count} open${share.view_count === 1 ? '' : 's'}`}
                                {(share.view_count ?? 0) > 0 && (share.listen_count ?? 0) > 0 && ' · '}
                                {(share.listen_count ?? 0) > 0 &&
                                  `${share.listen_count} play${share.listen_count === 1 ? '' : 's'}`}
                              </span>
                            )}
                            {formatShareExpiry(share.expires_at) && (
                              <span
                                className={
                                  expiryStatus === 'soon' || expiryStatus === 'expired'
                                    ? `song-share-preview-expiry is-expiry-${expiryStatus}`
                                    : 'song-share-preview-expiry'
                                }
                              >
                                {formatShareExpiry(share.expires_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="song-share-preview-actions">
                          <button
                            type="button"
                            className="song-share-preview-copy"
                            onClick={() => void copyLink(share.token)}
                          >
                            {copiedToken === share.token ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            className="song-share-preview-open"
                            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                      <p className="song-share-link" title={url}>
                        {url}
                      </p>
                      <div className="song-share-active-actions">
                        <button
                          type="button"
                          className="song-share-active-open"
                          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="song-share-active-copy"
                          onClick={() => void copyLink(share.token)}
                        >
                          {copiedToken === share.token ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          className="song-share-active-qr"
                          onClick={() => void openShareQr(share.token)}
                        >
                          QR
                        </button>
                        {(expiryStatus === 'soon' || expiryStatus === 'expired') && (
                          <button
                            type="button"
                            className="song-share-active-renew"
                            onClick={() => void renewLink(share.token)}
                          >
                            Renew
                          </button>
                        )}
                        <button
                          type="button"
                          className="song-share-active-revoke"
                          onClick={() => void revokeLink(share.token)}
                        >
                          Revoke
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="song-share-feedback">
            <div className="song-share-feedback-head">
              <span className="song-detail-label">Listener feedback</span>
              <button type="button" className="song-share-refresh" onClick={() => void loadShareData()}>
                {loading ? '…' : 'Refresh'}
              </button>
            </div>

            {feedback.length === 0 && !loading && (
              <p className="song-share-hint">Feedback from share links appears here with timestamps.</p>
            )}

            <ul className="song-share-feedback-list">
              {feedback.map((comment) => (
                <li key={comment.id} className="song-share-feedback-item">
                  <button
                    type="button"
                    className="song-share-feedback-time"
                    onClick={() => void playFeedbackAt(comment.timestamp_ms)}
                    title="Play from this moment"
                  >
                    {formatDuration(comment.timestamp_ms)}
                  </button>
                  <div>
                    <span className="song-share-feedback-author">{comment.author_name}</span>
                    <p>{comment.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {qrDataUrl && qrToken && (
            <div className="song-share-qr-overlay" role="dialog" aria-modal="true" aria-label="Share link QR code">
              <button
                type="button"
                className="song-share-qr-backdrop"
                aria-label="Close QR code"
                onClick={closeShareQr}
              />
              <div className="song-share-qr-panel">
                <img src={qrDataUrl} alt="QR code for share link" className="song-share-qr-image" />
                <p className="song-share-qr-url">{shareUrlFromToken(qrToken)}</p>
                <p className="song-share-qr-hint">Esc to close</p>
                <div className="song-share-qr-actions">
                  <button
                    type="button"
                    className="song-share-qr-open"
                    onClick={() =>
                      window.open(shareUrlFromToken(qrToken), '_blank', 'noopener,noreferrer')
                    }
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="song-share-qr-copy-link"
                    onClick={() => void copyLink(qrToken)}
                  >
                    {copiedToken === qrToken ? 'Copied!' : 'Copy link'}
                  </button>
                  <button type="button" className="song-share-qr-copy" onClick={() => void copyShareQr()}>
                    {qrCopied ? 'Copied!' : 'Copy image'}
                  </button>
                  <button type="button" className="song-share-qr-download" onClick={downloadShareQr}>
                    Download PNG
                  </button>
                  <button type="button" className="song-share-qr-close" onClick={closeShareQr}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
