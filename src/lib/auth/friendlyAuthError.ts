/**
 * Supabase Auth errors, in words a customer can act on.
 *
 * signInWithOtp hands back developer-facing text, and the sign-in and invite
 * pages used to print it as-is. The one that matters most is
 * `email_address_not_authorized`: until the project has its own SMTP
 * (Resend), Supabase's built-in email only delivers to members of the
 * project's own team. So email sign-in worked for Owen and for nobody else,
 * and every stranger who tried it would have been shown "Email sending is not
 * allowed for this address as your project is using the default SMTP
 * service", a sentence about our infrastructure, on the front door.
 *
 * Codes checked against Supabase's own error reference, not guessed.
 */
export function friendlyAuthError(
  error: { code?: string; message?: string } | null | undefined,
  opts: { googleAvailable: boolean },
): string {
  if (!error) return ''

  switch (error.code) {
    case 'email_address_not_authorized':
      return opts.googleAvailable
        ? 'Email sign-in is not switched on for new accounts yet. Use Continue with Google for now, it takes one tap.'
        : 'Email sign-in is not switched on for new accounts yet. Try again soon.'
    case 'over_email_send_rate_limit':
      return 'That address has had a few links in a short time. Wait a minute, then send it again.'
    case 'email_address_invalid':
      return 'That does not look like an email address. Check it and try again.'
    default:
      return error.message || 'Something went wrong sending the link. Try again in a moment.'
  }
}
