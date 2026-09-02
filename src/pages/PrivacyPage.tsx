import { usePageTitle } from '@/hooks/usePageTitle'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/ui/Wordmark'

/**
 * The privacy policy.
 *
 * Written from what the code actually does, not from a template. Every claim
 * below was checked against the repo on 31 August 2026:
 *
 *   - audio is stored as the file you imported, byte for byte (audioRepo
 *     stores `blob: file`, audioUpload sends `blobRecord.blob`; there is no
 *     MediaRecorder, no AudioContext encode, no transcode anywhere)
 *   - product_events is constrained at the database to eight known event
 *     names plus a number and a coarse bucket, so it cannot hold a title, a
 *     filename, a note or a lyric even by accident (migration 021)
 *   - deletion is real and cascades from auth.users, and the storage sweep is
 *     explicit because objects do not cascade (functions/delete-account)
 *
 * If any of those change, this page changes in the same commit. A privacy
 * policy that drifts from the code is worse than not having one, and this
 * product's whole position is that it does not lie to you.
 *
 * NOT LEGAL ADVICE. This is an accurate description of the system written by
 * the people who built it. Owen should have it reviewed before taking money.
 */
export function PrivacyPage() {
  usePageTitle('Privacy · songdrafts', 'What songdrafts stores, where, who touches it, and how to get it out or delete it. Written from what the code does.')
  return (
    <div className="legal">
      <header className="legal-head">
        <Link to="/" className="legal-logo"><Wordmark /></Link>
        <p className="legal-updated">Last updated 31 August 2026</p>
      </header>

      <main className="legal-body">
        <h1>Privacy</h1>

        <p className="legal-lede">
          songdrafts holds unreleased music. That is about as private as a file gets, so this
          page is specific rather than general. It describes what the software actually does.
        </p>

        <h2>The short version</h2>
        <ul>
          <li>Your audio is stored exactly as you imported it. We do not process, analyse or transcode it.</li>
          <li>Nobody here listens to your recordings.</li>
          <li>Nothing you upload is used to train any AI, ours or anyone else's.</li>
          <li>We never sell or share your music or your email with anyone.</li>
          <li>You can export everything as a zip, and delete everything, at any time.</li>
        </ul>

        <h2>What we hold</h2>

        <h3>Your account</h3>
        <p>
          Your email address, and a profile picture if you signed in with Google or added one
          yourself. That is the whole account record. We do not ask for your name, your address,
          your date of birth or your phone number.
        </p>

        <h3>Your music</h3>
        <p>
          The audio files you import, and what you write about them: song titles, lyrics, notes,
          tags, key, tempo, tuning and comments. Audio lives on your device first and is copied
          to storage so it can reach your other devices.
        </p>
        <p>
          <strong>The file you import is the file we store.</strong> We do not re-encode it,
          compress it, clean it up or run anything across it.
        </p>

        <h3>How you use it</h3>
        <p>
          We record eight things, by name, with a number and a coarse label: starting a session,
          finishing an import, moving a song between columns, renaming a song, starting playback,
          creating a share link, merging songs, and adding a take.
        </p>
        <p>
          The database itself refuses anything else. It will not accept a song title, a filename,
          a note, a lyric or any free text on those records, because the columns are constrained
          to a known list of names and to numbers. This is how we can say nobody browses your
          songs and mean it structurally, rather than as a promise.
        </p>

        <h3>Share links</h3>
        <p>
          When you share a song, we count views and plays so you can see whether the person
          opened it. Whoever you send it to does not need an account and we do not ask them for
          one. If they leave a comment, we store the comment and the timestamp it is pinned to.
        </p>

                <h2>Who we are</h2>
        <p>
          songdrafts is one person, not a company, and support@songdrafts.com reaches them
          directly rather than a queue. Nothing on this page is handled by anyone else.
        </p>

<h2>Who else touches it</h2>
        <p>
          Four companies, all as processors acting on our instructions, none of them permitted to
          use your data for their own purposes:
        </p>
        <ul>
          <li><strong>Supabase</strong> for the database, file storage and sign-in.</li>
          <li><strong>Vercel</strong> for hosting the site and the app.</li>
          <li><strong>Resend</strong> for sending email, such as invites and share notifications.</li>
          <li><strong>Google</strong>, only if you choose to sign in with Google.</li>
        </ul>
        <p>That is the complete list. There are no advertising, tracking or data-broker services.</p>

        <h2>Where it is, and how long we keep it</h2>
        <p>
          {/* REGION: Owen to confirm from Supabase, Project Settings, General.
              Left unstated rather than guessed, because "your unreleased music
              is safe" and a wrong country in the same sentence is worse than
              saying nothing. */}
          Your audio and your account sit with Supabase. If you need to know the exact
          region before you upload unreleased work, email support@songdrafts.com and we
          will tell you rather than make you guess.
        </p>
        <p>
          <strong>How long.</strong> Songs you delete wait 30 days in the trash and are then
          gone for good. If you close your account, everything goes at once: there is no
          grace period and no archived copy, which is the whole point of the delete button.
          The record that you were once a customer, meaning invoices and payment records,
          is kept for six years because tax law requires it. That record has no audio in it.
        </p>
        <p>
          <strong>Why we are allowed to hold it.</strong> Your account and your music: because
          we have a contract with you and cannot run the service without them. Payments and
          the records behind them: because the law requires us to keep them. The eight usage
          events: because we have a legitimate interest in knowing whether the product works,
          which is why they carry no titles, no filenames and no text.
        </p>

        <h2>Getting it out, and getting rid of it</h2>
        <p>
          <strong>Export.</strong> Settings has a backup export that produces a zip of your
          library. It keeps working whatever happens to us or to your subscription.
        </p>
        <p>
          <strong>Deleting a song.</strong> Deleted songs sit in Library for 30 days and can be
          restored, then they go for good.
        </p>
        <p>
          <strong>Deleting your account.</strong> Settings, Account, Delete my account. This
          removes your account, every song, every take, every comment and every audio file from
          our servers. It is not recoverable and there is no trash behind it, so export first if
          you want to keep anything.
        </p>

        <h2>Your rights</h2>
        <p>
          Under UK and EU data protection law you can ask for a copy of your data, ask us to
          correct it, ask us to delete it, or object to how we use it. The export and the delete
          button above do the first and third immediately and without asking anyone. For anything
          else, email <a href="mailto:support@songdrafts.com">support@songdrafts.com</a>.
        </p>

        <h2>Cookies</h2>
        <p>
          We use one thing that behaves like a cookie: the sign-in token that keeps you logged in.
          There are no analytics cookies, no advertising cookies and no third-party trackers,
          which is why this site has never shown you a consent banner.
        </p>

        <h2>Changes</h2>
        <p>
          If what the software does changes, this page changes with it, and the date at the top
          moves. We will not quietly widen what we collect.
        </p>

        <p className="legal-contact">
          Questions: <a href="mailto:support@songdrafts.com">support@songdrafts.com</a>
        </p>
      </main>

      <footer className="legal-foot">
        <Link to="/">Back to songdrafts</Link>
        <Link to="/terms">Terms</Link>
      </footer>
    </div>
  )
}
