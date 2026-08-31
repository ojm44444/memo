import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { Avatar } from '@/components/ui/Avatar'
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
import { clearMyAvatar, getMyAvatarUrl, setMyAvatar } from '@/lib/avatar'
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

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  useEffect(() => {
    void getMyAvatarUrl().then(setAvatarUrl)
  }, [])
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
              <p className="settings-install-note">
                A nudge to bring across whatever you have recorded since last time. It tells you
                where you got up to, so you know what to scroll past.
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
                    <p className="settings-install-note">
                      Your browser has not allowed notifications yet, so this will show inside the
                      app rather than on your desktop.{' '}
                      <button
                        type="button"
                        className="settings-avatar-clear"
                        onClick={async () => setNotifyOk(await requestNotifyPermission())}
                      >
                        Allow notifications
                      </button>
                    </p>
                  )}

                  {/* Said plainly, because the alternative is someone trusting
                      it to arrive on a Sunday and quietly losing weeks. */}
                  <p className="reminder-caveat">
                    songdrafts has no server sending these, so it arrives the next time you open
                    the app after that time, not while it is closed. Install it and it can reach
                    you on your desktop. Email and phone reminders need a backend and are not
                    built yet.
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
              <section className="settings-section">
                <h3 className="settings-section-title">Account</h3>

                {/* Signing in with Google already gives us a picture, so most
                    people never touch this. It is here for everyone else, and
                    for anyone who would rather not use the Google one. */}
                <div className="settings-avatar-row">
                  <Avatar label={email} url={avatarUrl} size={44} />
                  <div className="settings-avatar-actions">
                    <label className="settings-avatar-btn">
                      {avatarUrl ? 'Change picture' : 'Add a picture'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (!file) return
                          setAvatarError(null)
                          try {
                            setAvatarUrl(await setMyAvatar(file))
                          } catch (err) {
                            setAvatarError(err instanceof Error ? err.message : 'Could not save that picture')
                          }
                        }}
                      />
                    </label>
                    {avatarUrl && (
                      <button
                        type="button"
                        className="settings-avatar-clear"
                        onClick={async () => {
                          setAvatarError(null)
                          try {
                            await clearMyAvatar()
                            setAvatarUrl(await getMyAvatarUrl())
                          } catch (err) {
                            setAvatarError(err instanceof Error ? err.message : 'Could not remove it')
                          }
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {avatarError && <p className="settings-avatar-error">{avatarError}</p>}

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
