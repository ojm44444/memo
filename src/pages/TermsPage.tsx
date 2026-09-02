import { usePageTitle } from '@/hooks/usePageTitle'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/ui/Wordmark'

/**
 * Terms of service.
 *
 * Two things kept deliberately blunt because they are the ones people
 * actually care about and the ones most terms pages bury:
 *
 *   1. You own your music. We claim no licence over it beyond the mechanical
 *      one needed to store a file and play it back to you. Plenty of services
 *      grant themselves a broad "worldwide, royalty-free, sublicensable"
 *      licence to your uploads. This one does not, and songwriters are exactly
 *      the audience who will read that clause.
 *   2. What happens when you stop paying, stated in the same words as the
 *      pricing page.
 *
 * PRICING IS NOT STATED HERE ON PURPOSE. Billing does not exist yet. Writing
 * a number into the terms before Stripe is wired would put a false claim in
 * the one document that is supposed to be exact. The clause below describes
 * the shape and points at the pricing page for figures.
 *
 * NOT LEGAL ADVICE. Have this reviewed before taking money.
 */
export function TermsPage() {
  usePageTitle('Terms · songdrafts', 'The terms for using songdrafts: what you get, what it costs, how to stop, and what happens to your music.')
  return (
    <div className="legal">
      <header className="legal-head">
        <Link to="/" className="legal-logo"><Wordmark /></Link>
        <p className="legal-updated">Last updated 31 August 2026</p>
      </header>

      <main className="legal-body">
        <h1>Terms</h1>

        <p className="legal-lede">
          Plain terms for a small product. If something here reads as though it is hiding
          something, tell us and we will rewrite it.
        </p>

        <h2>Your music is yours</h2>
        <p>
          <strong>You keep every right in everything you upload.</strong> We do not claim
          ownership, we do not take a share of anything you release, and we claim no licence to
          use your recordings for anything.
        </p>
        <p>
          The only permission you give us is the mechanical one required to run the service:
          storing your files, moving them between your devices, and playing them back to you or
          to someone you deliberately send a share link to. That permission ends when you delete
          the file or your account.
        </p>
        <p>
          We will never use your recordings to train a machine learning model, and we will never
          licence them to anyone who would.
        </p>

        <h2>What you are responsible for</h2>
        <ul>
          <li>Having the right to upload what you upload.</li>
          <li>Keeping your own backups. Our export exists so you can, and you should.</li>
          <li>Who you send share links to. Anyone with the link can listen.</li>
        </ul>

        <h2>What we are responsible for</h2>
        <p>
          Running the service with reasonable care, keeping your audio private, and telling you
          honestly when something breaks. songdrafts is made by one person. It is not a bank and
          it does not come with a guarantee of uptime.
        </p>
        <p>
          <strong>Keep your own copies of anything you cannot afford to lose.</strong> We say
          this on the landing page too, and we would rather repeat it than have it read as small
          print.
        </p>

        <h2>Paying, and stopping</h2>
        <p>
          Prices and plans are on the <Link to="/#pricing">pricing section</Link>. Subscriptions
          renew until you cancel, and you can cancel at any time from your account.
        </p>
        <p>
          <strong>Cancelling never takes your music away from you.</strong> Your audio is on your
          device, the export keeps working after you cancel, and syncing and sharing stop until
          you come back.
        </p>

                <h3>Changing your mind in the first 14 days</h3>
        <p>
          If you are a consumer in the UK or EU you have a legal right to cancel within 14 days
          of paying and get your money back. To use it, email support@songdrafts.com within
          those 14 days and say so. That is the whole process.
        </p>
        <p>
          One thing to be clear about, because the law is: syncing and sharing start the
          moment you pay, and by paying you are asking us to start straight away rather than
          wait two weeks. If you cancel inside the 14 days after using it, we refund what you
          paid less a fair share for the days you had it. With the first week at $1 that share
          is small, and we would rather refund the lot than argue over pennies.
        </p>

        <h2>How old you need to be</h2>
        <p>
          You need to be 16 or over to open an account and pay for songdrafts. Under 16, a
          parent or guardian has to do it on your behalf. That is not us being cautious about
          your music, it is about payments and personal data, which are theirs to agree to
          until you are old enough to.
        </p>

<h2>Ending it</h2>
        <p>
          You can delete your account at any time from Settings. It removes everything from our
          servers and cannot be undone.
        </p>
        <p>
          We can close an account that is being used to break the law or to attack the service.
          If we ever do, you get your export first unless a court tells us otherwise.
        </p>

        <h2>If the service closes</h2>
        <p>
          If songdrafts shuts down, we will tell you before it happens and the export will keep
          working. Your audio is already on your device, so a closure does not take your library
          with it.
        </p>

        <h2>Liability</h2>
        <p>
          The service is provided as it is. To the extent the law allows, we are not liable for
          indirect or consequential loss, and our total liability is limited to what you have
          paid us in the previous twelve months. Nothing here limits liability that cannot be
          limited by law.
        </p>

        <h2>Law</h2>
        <p>These terms are governed by the law of England and Wales.</p>

        <p className="legal-contact">
          Questions: <a href="mailto:support@songdrafts.com">support@songdrafts.com</a>
        </p>
      </main>

      <footer className="legal-foot">
        <Link to="/">Back to songdrafts</Link>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  )
}
