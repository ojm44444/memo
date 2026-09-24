import { Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Wordmark } from '@/components/ui/Wordmark'
import { ContactForm } from '@/components/ui/ContactForm'

/** One place to reach a person. The form is the only public way in for now. */
export function ContactPage() {
  usePageTitle('Contact · songdrafts', 'Ask a question or tell us what went wrong. A person replies.')
  return (
    <div className="legal">
      <header className="legal-head">
        <Link to="/" className="legal-logo"><Wordmark /></Link>
      </header>
      <main className="legal-body">
        <h1>Contact</h1>
        <p className="legal-lede">Ask a question, or tell us what went wrong. A person reads every message and replies.</p>
        <ContactForm startOpen />
      </main>
      <footer className="legal-foot">
        <Link to="/">Back to songdrafts</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </footer>
    </div>
  )
}

export default ContactPage
