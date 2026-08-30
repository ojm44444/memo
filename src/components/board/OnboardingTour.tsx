import { useEffect, useState } from 'react'
import {
  isOnboardingTourComplete,
  setOnboardingTourComplete,
} from '@/lib/onboarding'
import { useBoardRole } from '@/hooks/useBoardRole'
import { useUiStore } from '@/stores/uiStore'

/**
 * Three steps, not five, and named after what the UI actually says.
 *
 * The previous copy taught "Manage" and "Favourites" as two of the three modes.
 * The nav has always said Board and Listen, so onboarding was teaching a
 * vocabulary that does not exist in the product. It also ran to five modal
 * steps before the user had seen anything, which is reading, not learning.
 *
 * The BD's ruling is to teach in place and drop the modal entirely. That is a
 * larger build; these are the three steps it approved for as long as the modal
 * survives, so the wrong names are not shipping in the meantime.
 */
const TOUR_STEPS = [
  {
    title: 'Everything starts in the Inbox',
    body: 'Import a folder or drop files in.',
  },
  {
    title: 'Move a song right when it gets better',
    body: 'Nothing expires, nothing nags you.',
  },
  {
    // "stacks" read as automatic - as if the app groups takes for you. It does
    // not: you add the new take to the song it belongs to. Copy is now active,
    // so nobody waits for magic that is not coming.
    title: 'Put every take on the same card',
    body: 'Add a new recording to the song it belongs to, then play them back to back.',
  },
] as const

interface OnboardingTourProps {
  readOnly?: boolean
}

export function OnboardingTour({ readOnly = false }: OnboardingTourProps) {
  const boardRole = useBoardRole()
  const tourNonce = useUiStore((state) => state.onboardingTourNonce)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (readOnly || boardRole !== 'owner') return

    let cancelled = false
    void (async () => {
      const complete = await isOnboardingTourComplete()
      if (!cancelled && !complete) {
        setStep(0)
        setOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [readOnly, boardRole])

  useEffect(() => {
    if (readOnly || boardRole !== 'owner' || tourNonce === 0) return
    setStep(0)
    setOpen(true)
  }, [tourNonce, readOnly, boardRole])

  if (!open) return null

  const current = TOUR_STEPS[step]
  const isLast = step === TOUR_STEPS.length - 1

  const finish = async () => {
    await setOnboardingTourComplete()
    setOpen(false)
  }

  const skip = () => {
    void finish()
  }

  const next = () => {
    if (isLast) {
      void finish()
      return
    }
    setStep((value) => value + 1)
  }

  return (
    <div className="onboarding-tour-overlay" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      <button type="button" className="onboarding-tour-backdrop" aria-label="Skip tour" onClick={skip} />
      <div className="onboarding-tour-card">
        <p className="onboarding-tour-step">
          Step {step + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="onboarding-tour-title">{current.title}</h2>
        <p className="onboarding-tour-body">{current.body}</p>

        <div className="onboarding-tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((_, index) => (
            <span key={index} className={index === step ? 'is-active' : undefined} />
          ))}
        </div>

        <div className="onboarding-tour-actions">
          <button type="button" className="onboarding-tour-skip" onClick={skip}>
            Skip
          </button>
          <button type="button" className="onboarding-tour-next" onClick={next}>
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
