import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { clearMyAvatar, getMyAvatarUrl, setMyAvatar } from '@/lib/avatar'
import { getMyDisplayName, hasChosenName, setMyDisplayName } from '@/lib/displayName'
import { supabase } from '@/lib/supabase/client'

/**
 * Who you are, at the top of Settings.
 *
 * It used to sit underneath Playback, Import, Help, Offline audio, Backup,
 * Reminders and Install, which is to say your own name and the button that
 * deletes everything you own were the last things on the page. Identity is the
 * first thing a person looks for in a settings panel, so it is now the first
 * thing in it.
 *
 * Split out of SettingsPanel because that file was doing avatars, deletion,
 * backups, reminders, notification permissions and PWA install in one
 * component, and every one of those has its own failure states.
 */
export function AccountSection({
  email,
  onSignOut,
  children,
}: {
  email: string
  onSignOut: () => void
  /** The danger zone, passed in so deletion stays owned by the panel. */
  children?: React.ReactNode
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [nameIsGuess, setNameIsGuess] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getMyAvatarUrl().then(setAvatarUrl)
    void getMyDisplayName().then((n) => {
      setName(n)
      setDraft(n)
    })
    if (!supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      setNameIsGuess(
        !hasChosenName(data.user?.user_metadata as Record<string, unknown> | undefined),
      )
    })
  }, [])

  const saveName = async () => {
    if (savingName || draft.trim() === name) return
    setNameError(null)
    setSavingName(true)
    try {
      const next = await setMyDisplayName(draft)
      setName(next)
      setDraft(next)
      setNameIsGuess(false)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save that name')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Account</h3>

      <div className="settings-avatar-row">
        <Avatar label={name || email} url={avatarUrl} size={44} />
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
                  setAvatarError(
                    err instanceof Error ? err.message : 'Could not save that picture',
                  )
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

      {/* The name is not decoration. It signs every comment, including the
          ones on a listen page you send to someone outside your band, and
          before this field existed that signature was your email address. */}
      <label className="settings-field">
        <span className="settings-field-label">Your name</span>
        <div className="settings-field-row">
          <input
            type="text"
            className="settings-field-input"
            value={draft}
            maxLength={40}
            autoComplete="name"
            placeholder="Owen"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void saveName()
              }
              if (e.key === 'Escape') setDraft(name)
            }}
          />
          <button
            type="button"
            className="settings-field-save"
            disabled={savingName || draft.trim() === name || !draft.trim()}
            onClick={() => void saveName()}
          >
            {savingName ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </label>
      <p className="settings-field-note">
        {nameIsGuess
          ? 'Signs your comments. Right now it is the front of your email address, which is what anyone you share a listen page with will see.'
          : 'Signs your comments, including on listen pages you share.'}
      </p>
      {nameError && <p className="settings-avatar-error">{nameError}</p>}

      <p className="settings-account-email">
        Signed in as {email}
      </p>
      {/* Asked more than once, so it is answered here rather than in support:
          there is no password on this account to change or lose. */}
      <p className="settings-field-note">
        songdrafts has no password. You sign in with a link sent to this address, or with
        Google. To use a different address, sign out and sign in with that one.
      </p>
      <button type="button" className="settings-sign-out" onClick={onSignOut}>
        Sign out
      </button>

      {children}
    </section>
  )
}
