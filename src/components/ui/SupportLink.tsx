/**
 * One plain way to reach a person, for the places people get stuck (sign in,
 * paying). Opens the contact form; the support address is never shown.
 */
export function SupportLink({ className }: { topic?: string; className?: string }) {
  return (
    <p className={className ?? 'support-link'}>
      Stuck?{' '}
      <a href="/contact" target="_blank" rel="noopener">
        Ask us
      </a>{' '}
      and a person replies.
    </p>
  )
}
