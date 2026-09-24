import { useState, type FormEvent } from 'react'
import { SUPPORT_EMAIL } from '@/lib/onboarding'

/**
 * "Ask us anything" on the landing page. Goes to the support inbox through the
 * contact-support function. If that fails for any reason, the person is given
 * the plain email address instead, so a question is never lost.
 */
export function ContactForm() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot, never shown
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setState('sending')
    setError(null)
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message, website }),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'failed')
      setState('sent')
    } catch (err) {
      setState('idle')
      setError(
        err instanceof Error && err.message !== 'failed' && err.message !== 'Failed to fetch'
          ? err.message
          : `That did not send. Email ${SUPPORT_EMAIL} and a person replies.`,
      )
    }
  }

  if (!open) {
    return (
      <button type="button" className="price-support" onClick={() => setOpen(true)}>
        Questions? Ask us, a person answers.
      </button>
    )
  }

  if (state === 'sent') {
    return <p className="contact-form-sent">Thanks. We will reply to {email}.</p>
  }

  return (
    <form className="contact-form" onSubmit={(e) => void submit(e)}>
      <label>
        Your email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        How can we help?
        <textarea required rows={4} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <input
        className="contact-form-hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      {error && <p className="contact-form-error">{error}</p>}
      <button type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  )
}
