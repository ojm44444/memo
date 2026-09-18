import { InstallGuide } from '@/components/onboarding/InstallGuide'

/**
 * Install songdrafts, step by step for the browser you are in, as a sheet
 * (17 Sept, Owen: he was on Chrome on iPhone, where the old banner never
 * appeared). The steps live in InstallGuide so the tour, Help and Settings
 * all say the same thing. Other devices are one tap away.
 */
export function PhoneInstallGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="send-sheet-backdrop" onClick={onClose}>
      <div
        className="send-sheet is-narrow phone-guide"
        role="dialog"
        aria-modal="true"
        aria-label="Install songdrafts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="send-sheet-head">
          <h2 className="send-sheet-title">Install songdrafts</h2>
          <button type="button" className="send-sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <InstallGuide />

        <p className="send-sheet-note">
          Your songs stay in sync between your phone and computer once you are signed in on both.
        </p>

        <div className="send-sheet-actions">
          <button type="button" className="send-sheet-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
