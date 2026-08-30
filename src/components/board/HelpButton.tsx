import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getImportWatermark } from '@/db/repositories/integrityRepo'

/**
 * Help, bottom right (Owen's ask). One sheet, three sections: how audio gets
 * in (the B6 honest routes), where things live, and a person to write to.
 *
 * SUPPORT EMAIL IS A PLACEHOLDER: support@songdrafts.com has no mailbox behind
 * it yet. Owen has to create the address (or a forward) at IONOS before launch,
 * or this line is a promise the product does not keep. Tracked in the decision
 * log; do not ship the waitlist-era mistake twice.
 */
const SUPPORT_EMAIL = 'support@songdrafts.com'

export function HelpButton() {
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  // "Where did I get up to" is a question you ask while using the app, not on
  // an empty board, so the watermark lives here as well as on the import
  // screen - it is only computable once there ARE songs.
  const watermark = useLiveQuery(() => (open ? getImportWatermark() : undefined), [open])

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

      {open && (
        <div className="help-sheet" ref={sheetRef} role="dialog" aria-label="Help">
          <h3 className="help-sheet-title">Getting your memos in</h3>

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
            <h4>On a Mac</h4>
            <p>
              Link your Voice Memos folder once (the card in your Inbox) and everything synced to
              this Mac imports, plus every new memo after.
            </p>
          </div>

          <div className="help-sheet-section">
            <h4>On your iPhone</h4>
            <p>
              In Voice Memos, select your recordings and Save to Files. Then tap + Import audio
              here and pick them all in one go from Files.
            </p>
          </div>

          <div className="help-sheet-section">
            <h4>From anywhere else</h4>
            <p>Drag audio straight onto the board. It lands in Inbox.</p>
          </div>

          <p className="help-sheet-note">
            No app can read your Voice Memos library directly. Not us, not App Store apps,
            nobody: Apple does not allow it. These are the honest routes.
          </p>

          <div className="help-sheet-section">
            <h4>Where your music lives</h4>
            <p>
              On this device first. The board works with the internet off, and everything syncs
              up when you are back. You can download the whole library as a zip from Settings any
              time.
            </p>
          </div>

          <p className="help-sheet-contact">
            Stuck on something? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
            and a person reads it.
          </p>
        </div>
      )}
    </>
  )
}
