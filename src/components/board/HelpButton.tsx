import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getImportWatermark } from '@/db/repositories/integrityRepo'
import { useUiStore } from '@/stores/uiStore'
import { PhoneInstallGuide } from '@/components/layout/PhoneInstallGuide'
import { ImportGuide } from '@/components/onboarding/ImportGuide'
import {
  HELP_FAB_OPENS,
  countAppOpen,
  hideHelpFab,
  isHelpFabHidden,
  isOnboardingTourComplete,
} from '@/lib/onboarding'

/**
 * Help, bottom right, for newcomers only.
 *
 * 18 Sept, Owen: the question mark is useful but "should not be there all the
 * time, it would be a bit annoying". So it shows until the guide is done and
 * for the first few app opens after, then steps aside (or sooner, with Hide
 * this button). Help and the guide live in Settings for good, which is also
 * in the phone ⋮ menu.
 */
export function HelpButton() {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  // "Where did I get up to" is a question you ask while using the app, not on
  // an empty board, so the watermark lives here as well as on the import
  // screen - it is only computable once there ARE songs.
  const watermark = useLiveQuery(() => (open ? getImportWatermark() : undefined), [open])

  useEffect(() => {
    const opens = countAppOpen()
    if (isHelpFabHidden()) return
    let live = true
    void isOnboardingTourComplete().then((done) => {
      if (live) setVisible(!done || opens <= HELP_FAB_OPENS)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  if (!visible) return null

  return (
    <>
      <button
        type="button"
        className="help-fab"
        aria-label={open ? 'Close help' : 'Help'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>

      {phone && <PhoneInstallGuide onClose={() => setPhone(false)} />}

      {open && (
        <div className="help-sheet" ref={sheetRef} role="dialog" aria-label="Help">
          <h3 className="help-sheet-title">Help</h3>

          {/* 17 Sept, Owen: the guide should be reachable whenever, not only
              on the first run. */}
          <div className="help-sheet-actions">
            <button
              type="button"
              className="help-sheet-btn"
              onClick={() => {
                setOpen(false)
                useUiStore.getState().requestOnboardingTour()
              }}
            >
              Show me the guide again
            </button>
            <button
              type="button"
              className="help-sheet-btn"
              onClick={() => {
                setOpen(false)
                setPhone(true)
              }}
            >
              Install songdrafts
            </button>
          </div>

          {watermark && (
            <div className="help-watermark">
              <span className="help-watermark-label">You got up to</span>
              <strong>
                {new Date(watermark.recordedAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>
              <span className="help-watermark-sub">
                Anything recorded after that is still only on your phone. Start there.
              </span>
            </div>
          )}

          <div className="help-sheet-section">
            <h4>Getting your audio in</h4>
            <ImportGuide />
          </div>

          <div className="help-sheet-section">
            <h4>Where your music lives</h4>
            <p>
              On this device first. The board works with the internet off, and everything syncs
              up when you are back. You can download the whole library as a zip from Settings any
              time.
            </p>
          </div>

          <p className="help-sheet-contact">
            Stuck on something?{' '}
            <a href="/contact" target="_blank" rel="noopener">Ask us</a> and a person reads it.
          </p>

          <button
            type="button"
            className="ob-link help-sheet-hide"
            onClick={() => {
              hideHelpFab()
              setOpen(false)
              setVisible(false)
            }}
          >
            Hide this button. Help stays in Settings.
          </button>
        </div>
      )}
    </>
  )
}
