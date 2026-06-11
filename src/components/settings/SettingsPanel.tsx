import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { MobileImportCard } from '@/components/import/VoiceMemosShareCard'
import { markExplicitSignOut } from '@/lib/auth/session'
import { clearLocalUserBoard } from '@/db/clearLocalUserBoard'
import { getDefaultPlaybackRate, setDefaultPlaybackRate } from '@/lib/preferences'
import type { PlaybackRate } from '@/lib/constants'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import { usePlayerStore } from '@/stores/playerStore'
import { exportBoardBackup } from '@/lib/export/exportBoardBackup'
import { importBoardBackup } from '@/lib/export/importBoardBackup'
import type { ImportBackupResult, ImportProgress } from '@/lib/export/backupTypes'
import { resetOnboardingTour } from '@/lib/onboarding'
import { cachePendingRemoteAudio, countUncachedRemoteAudio } from '@/sync/audioDownload'
import { useUiStore } from '@/stores/uiStore'

export function SettingsPanel() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [defaultRate, setDefaultRate] = useState<PlaybackRate>(1)
  const [email, setEmail] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [importResult, setImportResult] = useState<ImportBackupResult | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [cachingAudio, setCachingAudio] = useState(false)
  const [cacheProgress, setCacheProgress] = useState<{ done: number; total: number } | null>(null)
  const uncachedAudio = useLiveQuery(() => countUncachedRemoteAudio(), [open])
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getDefaultPlaybackRate().then(setDefaultRate)
    if (!supabase) return
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [open])

  const signOut = async () => {
    if (!supabase) return
    usePlayerStore.getState().stop()
    markExplicitSignOut()
    await clearLocalUserBoard()
    await supabase.auth.signOut()
    navigate('/sign-in', { replace: true })
  }

  const updateRate = async (rate: PlaybackRate) => {
    setDefaultRate(rate)
    usePlayerStore.getState().setPlaybackRate(rate)
    await setDefaultPlaybackRate(rate)
  }

  return (
    <>
      <button
        type="button"
        className="settings-trigger"
        onClick={() => setOpen(true)}
        aria-label="Settings"
      >
        ⚙
      </button>

      {open && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
          <button
            type="button"
            className="settings-backdrop"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          />
          <div className="settings-panel">
            <div className="settings-header">
              <h2 className="settings-title">Settings</h2>
              <button type="button" className="settings-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <section className="settings-section">
              <h3 className="settings-section-title">Playback</h3>
              <p className="settings-section-copy">Default speed for skimming demos and memos.</p>
              <SpeedControl value={defaultRate} onChange={(rate) => void updateRate(rate)} />
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Import</h3>
              <MobileImportCard />
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Help</h3>
              <p className="settings-section-copy">Walk through the board tour again.</p>
              <button
                type="button"
                className="settings-export"
                onClick={() => {
                  void resetOnboardingTour().then(() => {
                    useUiStore.getState().requestOnboardingTour()
                    setOpen(false)
                  })
                }}
              >
                Show onboarding tour
              </button>
            </section>

            {supabaseConfigured && (
              <section className="settings-section">
                <h3 className="settings-section-title">Offline audio</h3>
                <p className="settings-section-copy">
                  Save cloud memos on this device so they play without a network connection.
                </p>
                {(uncachedAudio ?? 0) > 0 ? (
                  <p className="settings-section-copy">
                    {uncachedAudio} clip{(uncachedAudio ?? 0) === 1 ? '' : 's'} waiting to download.
                  </p>
                ) : (
                  <p className="settings-section-copy">All synced audio is available offline.</p>
                )}
                {cacheProgress && (
                  <p className="settings-progress-label">
                    Downloading {cacheProgress.done}/{cacheProgress.total}…
                  </p>
                )}
                <button
                  type="button"
                  className="settings-export"
                  disabled={cachingAudio || (uncachedAudio ?? 0) === 0}
                  onClick={() => {
                    setCachingAudio(true)
                    setCacheProgress({ done: 0, total: uncachedAudio ?? 0 })
                    void cachePendingRemoteAudio({
                      onProgress: (done, total) => setCacheProgress({ done, total }),
                    })
                      .catch((err) => {
                        alert(err instanceof Error ? err.message : 'Download failed')
                      })
                      .finally(() => {
                        setCachingAudio(false)
                        setCacheProgress(null)
                      })
                  }}
                >
                  {cachingAudio ? 'Downloading…' : 'Download cloud audio'}
                </button>
              </section>
            )}

            <section className="settings-section">
              <h3 className="settings-section-title">Backup</h3>
              <p className="settings-section-copy">
                Download a ZIP of your projects, songs, notes, and local audio files.
              </p>
              <button
                type="button"
                className="settings-export"
                disabled={exporting}
                onClick={() => {
                  setExporting(true)
                  void exportBoardBackup()
                    .catch((err) => {
                      alert(err instanceof Error ? err.message : 'Export failed')
                    })
                    .finally(() => setExporting(false))
                }}
              >
                {exporting ? 'Exporting…' : 'Export backup'}
              </button>

              <div className="settings-import-mode">
                <label className="settings-import-option">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  Add to library (new project)
                </label>
                <label className="settings-import-option">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  Replace everything on this device
                </label>
              </div>

              <input
                ref={importInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return

                  if (
                    importMode === 'replace' &&
                    !confirm(
                      'Replace all local memos on this device with this backup? Cloud data is unchanged.',
                    )
                  ) {
                    event.target.value = ''
                    return
                  }

                  setImporting(true)
                  setImportResult(null)
                  setImportProgress(null)
                  void importBoardBackup(file, importMode, setImportProgress)
                    .then((result) => setImportResult(result))
                    .catch((err) => {
                      alert(err instanceof Error ? err.message : 'Import failed')
                    })
                    .finally(() => {
                      setImporting(false)
                      setImportProgress(null)
                      event.target.value = ''
                    })
                }}
              />

              <button
                type="button"
                className="settings-export"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                {importing ? 'Importing…' : 'Import backup'}
              </button>

              {importProgress && importing && (
                <div className="settings-progress">
                  <div
                    className="settings-progress-bar"
                    style={{
                      width:
                        importProgress.total > 0
                          ? `${Math.round((importProgress.done / importProgress.total) * 100)}%`
                          : '0%',
                    }}
                  />
                  <p className="settings-progress-label">{importProgress.message}</p>
                </div>
              )}

              {importResult && (
                <p className="settings-import-result">
                  Restored {importResult.projectName} from{' '}
                  {new Date(importResult.exportedAt).toLocaleDateString()} ·{' '}
                  {importResult.songsImported} songs · {importResult.audioImported} audio clips
                  {importResult.audioSkipped > 0
                    ? ` · ${importResult.audioSkipped} without audio`
                    : ''}
                  {importResult.mode === 'merge' ? ' into a new project' : ''}.
                </p>
              )}
            </section>

            {supabaseConfigured && email && (
              <section className="settings-section">
                <h3 className="settings-section-title">Account</h3>
                <p className="settings-account-email">{email}</p>
                <button type="button" className="settings-sign-out" onClick={() => void signOut()}>
                  Sign out
                </button>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
