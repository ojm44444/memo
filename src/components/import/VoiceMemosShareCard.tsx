/**
 * The card in an empty Inbox. It used to offer to link the Mac Voice Memos
 * folder; that does not work reliably (Owen, 24 Sept), so it now shows the
 * routes that do, the same ones as everywhere else.
 */
import { ImportGuide } from '@/components/onboarding/ImportGuide'

export function MobileImportCard() {
  return (
    <div className="voice-memos-share">
      <p className="voice-memos-share-eyebrow">Get your recordings in</p>
      <ImportGuide />
    </div>
  )
}
