import { usePageTitle } from '@/hooks/usePageTitle'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/ui/Wordmark'
import { CookieSettingsLink } from '@/components/layout/AdConsent'
import { PRICE_TABLE } from '@/lib/currency'

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
 * Prices are read from lib/currency, the same table the pricing page and the
 * checkout use, so the two can never drift apart.
 *
 * The 30-day money-back guarantee (Owen, 18 Sept) is stated plainly here
 * because it is stated plainly on the landing page: same 30 days on yearly
 * and monthly, full refund of the first payment, no questions.
 *
 * NOT LEGAL ADVICE. Have this reviewed before taking money.
 */
export function TermsPage() {
  usePageTitle('Terms · songdrafts', 'The terms for using songdrafts: what you get, what it costs, how to stop, and what happens to your music.')
  return (
    <div className="legal">
      <header className="legal-head">
        <Link to="/" className="legal-logo"><Wordmark /></Link>
        <p className="legal-updated">Last updated 18 September 2026</p>
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
          honestly when something breaks. songdrafts is a small operation. It is not a bank and
          it does not come with a guarantee of uptime.
        </p>
        <p>
          <strong>Keep your own copies of anything you cannot afford to lose.</strong> We say
          this on the landing page too, and we would rather repeat it than have it read as small
          print.
        </p>

        <h2>Paying, and stopping</h2>
        <p>
          songdrafts is ${PRICE_TABLE.usd.year} a year or ${PRICE_TABLE.usd.month} a month,
          charged when you subscribe. In pounds it is £{PRICE_TABLE.gbp.year} a year or £
          {PRICE_TABLE.gbp.month} a month. There is no free trial. Prices are also on the{' '}
          <Link to="/#pricing">pricing section</Link>.
        </p>
        {/* The founding price paragraph lived here while the $49 offer was on
            (15 Sept, a few hours). Bring it back only with FOUNDING_OFFER. */}
        <p>
          Plans renew automatically until you cancel. You can cancel at any time in Settings, and
          you keep your plan until the end of the period you paid for.
        </p>
        <p>
          <strong>Cancelling never takes the songs on your devices.</strong> The export keeps
          working after you cancel. Syncing and sharing stop. Copies in our cloud are kept for 90
          days after a plan ends, and we email you twice before they are removed.
        </p>

        <h3>100% money-back guarantee</h3>
        <p>
          <strong>Ask within 30 days of your first payment and we refund it in full.</strong>{' '}
          Yearly or monthly, the same 30 days. No reason needed, no questions, and nothing is
          pro-rated: you get the whole of that payment back. Use the refund button in Settings,
          or email <a href="mailto:songdraftsapp@gmail.com">songdraftsapp@gmail.com</a>. Your
          plan ends when the refund is made. Your songs stay on your device, and you can export
          them all as one zip from Settings.
        </p>
        <p>
          If you are a consumer in the UK or EU you also have a legal right to cancel within 14
          days of paying. The refunds above cover that in full.
        </p>
        <p>Renewal payments are not refunded. To stop a renewal, cancel before the renewal date.</p>

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
          Questions: <a href="mailto:songdraftsapp@gmail.com">songdraftsapp@gmail.com</a>
        </p>
      </main>

      <footer className="legal-foot">
        <Link to="/">Back to songdrafts</Link>
        <Link to="/privacy">Privacy</Link>
        <CookieSettingsLink />
      </footer>
    </div>
  )
}
