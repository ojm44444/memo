import { ImportGuide as Routes } from '@/components/onboarding/ImportGuide'

/**
 * The empty board's welcome. The routes, and the "last one you brought in"
 * card, live in one place (onboarding/ImportGuide) so this, the tour, Help,
 * Settings and the emails cannot disagree.
 */
export function ImportGuide() {
  return (
    <div className="import-guide">
      <div className="import-guide-head">
        <h2 className="import-guide-title">Bring the pile in.</h2>
        <p className="import-guide-lead">Pick where your recordings are and follow the steps.</p>
      </div>
      <Routes />
    </div>
  )
}
