import { SUPPORT_EMAIL } from '@/lib/onboarding'

/**
 * One plain way to reach a person, for the places people get stuck (sign in,
 * paying). The subject is filled in so the message says where it came from.
 */
export function SupportLink({ topic, className }: { topic: string; className?: string }) {
  const subject = encodeURIComponent(`songdrafts help: ${topic}`)
  return (
    <p className={className ?? 'support-link'}>
      Stuck? <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>Email {SUPPORT_EMAIL}</a> and a person replies.
    </p>
  )
}
