import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { AccountSection } from '@/components/settings/AccountSection'
import { PlanSection } from '@/components/settings/PlanSection'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import {
  DAY_NAMES,
  buildReminderMessage,
  canNotify,
  getReminderSettings,
  requestNotifyPermission,
  setReminderSettings,
  type ReminderDay,
  type ReminderFrequency,
  type ReminderSettings,
} from '@/lib/reminders'
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
import {
  cachePendingRemoteAudio,
  countUncachedRemoteAudio,
  resetAudioDownloadBackoff,
} from '@/sync/audioDownload'
import { getBudgetState, resetEgressBudget } from '@/sync/egressBudget'
import { useUiStore } from '@/stores/uiStore'

export function SettingsPanel() {
  const navigate = useNavigate()
  const { canInstall, isInstalled, install } = usePwaInstall()
  const [reminder, setReminder] = useState<ReminderSettings | null>(null)
  const [notifyOk, setNotifyOk] = useState(canNotify())
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    void getReminderSettings().then(setReminder)
    void buildReminderMessage().then((m) => setPreview(m.body))
  }, [])

  const saveReminder = async (next: ReminderSettings) => {
    setReminder(next)
    await setReminderSettings(next)
    if (next.frequency !== 'off' && !canNotify()) {
      setNotifyOk(await requestNotifyPermission())
    }
  }

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
  const [budget, setBudget] = useState(getBudgetState)
  useEffect(() => {
    if (open) setBudget(getBudgetState())
  }, [open])
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

  /**
   * Delete the account, for real.
   *
   * Typed confirmation rather than a second "are you sure" button, because
   * this is unrecoverable and there is no trash behind it: the 30 day window
   * applies to a deleted SONG, not to a deleted account. Someone has to write
   * the word, which is the standard pattern for exactly this reason.
   *
   * The export sits directly above it on purpose. Offering the way out next to
   * the door is the difference between "delete means delete" being a promise
   * and being a trap.
   */
  const deleteAccount = async () => {
    if (!supabase || deletingAccount) return
    setDeleteError(null)
    setDeletingAccount(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sign in again before deleting your account.')

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (error) throw error

      usePlayerStore.getState().stop()
      markExplicitSignOut()
      await clearLocalUserBoard()
      await supabase.auth.signOut()
      navigate('/', { replace: true })
    } catch (err) {
      /* The commonest failure here is that the edge function is not deployed,
         which Supabase surfaces as a bare "Failed to send a request" or a 404.
         Raw transport errors on the button marked "Delete everything" read as
         "it might have half worked", so say the true and reassuring thing:
         nothing was removed. */
      const raw = err instanceof Error ? err.message : ''
      const notDeployed =
        /not found|404|failed to send|failed to fetch|non-2xx/i.test(raw)
      setDeleteError(
        notDeployed
          ? 'Account deletion is not switched on yet, so nothing was removed. Email support@songdrafts.com and it will be done by hand.'
          : raw || 'Could not delete the account. Nothing was removed.',
      )
    } finally {
      setDeletingAccount(false)
    }
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

            {supabaseConfigured && email && (
              <>
                <AccountSection email={email} onSignOut={() => void signOut()} />
                <PlanSection />
              </>
            )}

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
                    {uncachedAudio} take{(uncachedAudio ?? 0) === 1 ? '' : 's'} waiting to download.
                  </p>
                ) : (
                  <p className="settings-section-copy">All synced audio is available offline.</p>
                )}
                {budget.tripped && (
                  /* Never stop quietly. An app that silently declines to fetch
                     someone's music is indistinguishable from a broken one. */
                  <p className="settings-note" style={{ marginTop: 0 }}>
                    Automatic downloading paused for today. songdrafts fetched{' '}
                    {(budget.bytes / (1024 * 1024 * 1024)).toFixed(1)} GB by itself, which is far
                    more than it should ever need, so it stopped rather than keep going. Nothing
                    is lost and nothing is charged to you. Press the button below to download
                    anyway.
                  </p>
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
                    // A person pressed the button, so ignore any backoff the
                    // sync loop is observing and try everything again now.
                    resetAudioDownloadBackoff()
                    resetEgressBudget()
                    setBudget(getBudgetState())
                    void cachePendingRemoteAudio({
                      force: true,
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
                  {importResult.songsImported} songs · {importResult.audioImported} takes
                  {importResult.audioSkipped > 0
                    ? ` · ${importResult.audioSkipped} without audio`
                    : ''}
                  {importResult.mode === 'merge' ? ' into a new project' : ''}.
                </p>
              )}
            </section>

            {/* The install prompt only ever appeared as a banner you could
                dismiss, and once dismissed there was nowhere to find it again.
                Installing is the difference between a tab you close and a
                thing in your dock, which for a tool you are meant to reach for
                mid-idea is most of the product. It belongs somewhere
                permanent. */}
            {/* The nudge to go and collect what you have recorded since last
                time. Never a "you have not written this week": during a dry
                spell that is worse than silence, and this audience is already
                told often enough that their problem is discipline. It states
                the watermark and asks for nothing. */}
            <section className="settings-section">
              <h3 className="settings-section-title">Reminders</h3>
              <p className="settings-section-copy">
                A nudge to collect what you have recorded since last time.
              </p>

              <div className="reminder-row">
                {(['off', 'weekly', 'fortnightly', 'monthly'] as ReminderFrequency[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`reminder-chip${reminder?.frequency === f ? ' is-on' : ''}`}
                    aria-pressed={reminder?.frequency === f}
                    onClick={() => reminder && void saveReminder({ ...reminder, frequency: f })}
                  >
                    {f === 'off' ? 'Off' : f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {reminder && reminder.frequency !== 'off' && (
                <>
                  <div className="reminder-row">
                    <label className="reminder-field">
                      <span>Day</span>
                      <select
                        value={reminder.day}
                        onChange={(e) =>
                          void saveReminder({
                            ...reminder,
                            day: Number(e.target.value) as ReminderDay,
                          })
                        }
                      >
                        {DAY_NAMES.map((d, i) => (
                          <option key={d} value={i}>{d}</option>
                        ))}
                      </select>
                    </label>
                    <label className="reminder-field">
                      <span>Time</span>
                      <select
                        value={reminder.hour}
                        onChange={(e) =>
                          void saveReminder({ ...reminder, hour: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {preview && (
                    <p className="reminder-preview">
                      <span className="reminder-preview-label">It will say</span>
                      {preview}
                    </p>
                  )}

                  {!notifyOk && (
                    <div className="reminder-permission">
                      <span>Shows in the app only, until your browser allows notifications.</span>
                      <button
                        type="button"
                        className="reminder-allow"
                        onClick={async () => setNotifyOk(await requestNotifyPermission())}
                      >
                        Allow
                      </button>
                    </div>
                  )}

                  {/* One line, and it stays. The alternative is someone
                      trusting this to arrive on a Sunday and quietly losing
                      weeks. What was cut is the line about email and phone
                      reminders needing a backend: that is roadmap, and telling
                      someone about a feature that does not exist is not their
                      problem to hold. */}
                  <p className="settings-note">
                    Arrives next time you open songdrafts after that time, not while it is closed.
                    Install it to get these on your desktop.
                  </p>
                </>
              )}
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Install</h3>
              {isInstalled ? (
                <p className="settings-install-note">
                  Installed. songdrafts opens in its own window.
                </p>
              ) : canInstall ? (
                <>
                  <p className="settings-install-note">
                    Runs in its own window, with its own icon, and works offline.
                  </p>
                  <button
                    type="button"
                    className="settings-install-btn"
                    onClick={() => void install()}
                  >
                    Install songdrafts
                  </button>
                </>
              ) : (
                <p className="settings-install-note">
                  Chrome and Edge, on Windows or Mac: look for the install icon in the address
                  bar. Safari on Mac: File, then Add to Dock. iPhone: Share, then Add to Home
                  Screen.
                </p>
              )}
            </section>

            {supabaseConfigured && email && (
              <section className="settings-section settings-section-danger">
                <h3 className="settings-section-title">Delete account</h3>
              <div className="settings-danger">
                {!deleteOpen ? (
                  <button
                    type="button"
                    className="settings-delete-open"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete my account
                  </button>
                ) : (
                  <>
                    <p className="settings-note" style={{ marginTop: 0 }}>
                      This removes your account, every song, every take and all of your audio
                      from our servers. It cannot be undone and there is no trash behind it.
                      Export your library first if you want to keep it.
                    </p>
                    <label className="reminder-field" style={{ marginBottom: 10 }}>
                      <span>Type DELETE to confirm</span>
                      <input
                        type="text"
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="DELETE"
                        autoComplete="off"
                      />
                    </label>
                    <div className="reminder-row" style={{ marginBottom: 0 }}>
                      <button
                        type="button"
                        className="settings-delete-confirm"
                        disabled={deleteConfirm.trim() !== 'DELETE' || deletingAccount}
                        onClick={() => void deleteAccount()}
                      >
                        {deletingAccount ? 'Deleting…' : 'Delete everything'}
                      </button>
                      <button
                        type="button"
                        className="settings-avatar-clear"
                        onClick={() => {
                          setDeleteOpen(false)
                          setDeleteConfirm('')
                          setDeleteError(null)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {deleteError && <p className="settings-avatar-error">{deleteError}</p>}
                  </>
                )}
              </div>
              </section>
            )}

          </div>
        </div>
      )}
    </>
  )
}
