/**
 * Every email songdrafts sends, in one file.
 *
 * Plain text with a light HTML wrapper, no images, no tracking pixel, no
 * "view in browser". This audience is the one that notices, and a lifecycle
 * email that looks like a newsletter gets filed as one. It should read like a
 * person wrote it, because the alternative reads like a funnel.
 *
 * RULES THAT DO NOT BEND HERE:
 *  - No em dashes anywhere in the copy.
 *  - No claim about what the product does that is not true today. Six false
 *    claims were found on the live landing page in two days; a claim in an
 *    email is worse, because it arrives unprompted and cannot be edited after
 *    it has been read.
 *  - Nothing about AI. "Nothing you record trains an AI" is the only mention
 *    the brand makes, and it is a promise, not a feature.
 *  - Every message says how to stop getting them, including the ones that are
 *    technically transactional.
 */

export interface EmailTemplate {
  subject: string
  /** Plain text. The HTML version is generated from this. */
  text: string
}

/*
 * Signed by the team, in the first person plural.
 *
 * These used to be signed "Owen" and written as "I", which tells a customer
 * the business is one person. Owen has ruled twice that the site must not say
 * that ("built by the team" is deliberate), and an email that arrives in
 * someone's inbox says it more loudly than any page could.
 */
const SIGN_OFF = 'The songdrafts team'

/*
 * CHECKED AGAINST THE CODE, 11 Sept 2026. Each of these was a sentence in an
 * earlier draft that would have gone out false the moment Resend was wired:
 *
 *  - "On an iPhone, share the memos to songdrafts." There is no share_target
 *    in the PWA manifest, so songdrafts never appears in the share sheet.
 *  - "Open the Voice Memos app, select everything, and drag it onto the
 *    Inbox column." A drag straight out of Voice Memos arrives with no files,
 *    and extract-audio-files classifies it as 'voice-memos-app' and REJECTS
 *    it. The first instruction to a new customer was the one thing the app
 *    refuses. The routes below are the ones HelpButton documents.
 *  - "The link-your-folder card" needs showDirectoryPicker (Chrome and Edge
 *    only) and memos synced to the Mac, so it is offered with both conditions.
 *  - "If songdrafts is still on a computer you use, the recordings are
 *    already there." A device only holds audio imported on it or downloaded
 *    to it; a take recorded on a phone lives only in the cloud. Telling
 *    someone their audio is safe days before deleting the only copy is the
 *    worst sentence this file could contain.
 *  - "Export a backup, a ZIP with your audio files." exportBoardBackup only
 *    includes audio held on that device, so every backup instruction now says
 *    to press Download all audio first. That works after a lapse too: storage
 *    policy audio_storage_select_own has no subscription check.
 *  - "Subscribing again puts them back in the cloud." Audio uploads only when
 *    a take is first imported; nothing re-uploads a local recording whose
 *    cloud copy was removed. Cut.
 *  - "Your trial ends. After that it is $49 for the year. Nothing happens
 *    without that." Checkout creates a subscription with a 7 day trial, so the
 *    charge happens automatically unless they cancel. The email now says the
 *    amount, the date, and that it is automatic.
 *  - "Nothing expires" in the welcome. Cloud audio is deleted 90 days after a
 *    lapse. Cut.
 */

/** The backup, as an instruction that actually produces a complete one. */
const BACKUP_STEPS = `Open songdrafts, go to Settings, and press Download all audio first,
so every recording is on that device. Then press Export backup. You get a
ZIP with the audio files and a readable list of your songs, and it stays
useful whether or not you ever open songdrafts again.`

/**
 * Day 0. Sent once, when the account is created.
 *
 * One job: get the first import done. Everything else about songdrafts is
 * worthless until there is audio on the board, and the commonest way a
 * local-first tool dies is that someone signs up on a laptop, never puts
 * their voice memos in it, and never comes back.
 */
export function welcomeEmail(name: string): EmailTemplate {
  return {
    subject: 'Get your voice memos in',
    text: `Hi ${name},

Thanks for signing up to songdrafts.

It only starts to work once your recordings are in it, so start there.

On an iPhone: in Voice Memos, select your recordings and Save to Files. Then
tap + Import audio in songdrafts and pick them all in one go from Files.

On a Mac: if your memos sync to the Mac through iCloud, the card at the top of
your Inbox links the Voice Memos folder once, and everything on that Mac comes
in, plus every new memo after. That needs Chrome or Edge. Otherwise, drag the
audio files from Finder onto the board and they land in Inbox.

Then move one song to the right when it gets better. That is the entire idea.
Nothing nags you, and there is no streak to keep.

If the import does not work on your setup, reply and tell us what happened. It
is the part we most want to hear about.

${SIGN_OFF}`,
  }
}

/**
 * Day 3, only if the board is still empty.
 *
 * Not a "you have not used it" email. Someone who signed up and stalled almost
 * always hit a wall at the import, and the useful thing is to name the wall
 * and offer to fix it, not to remind them they were lazy.
 */
export function stalledImportEmail(name: string): EmailTemplate {
  return {
    subject: 'Did the import work?',
    text: `Hi ${name},

Your board is still empty, which usually means the import got stuck rather
than that you changed your mind.

The two that catch people out:

If your memos are on your phone, they have to come across first. In Voice
Memos, select them and Save to Files, then tap + Import audio in songdrafts
and pick them from Files.

If you are on a Mac and linked the Voice Memos folder but nothing arrived, the
memos are probably still in iCloud rather than downloaded onto the machine.
Opening each one once in Voice Memos pulls it down.

If it was neither of those, reply and tell us what you saw. We would rather
fix it than have you quietly give up on it.

${SIGN_OFF}`,
  }
}

/**
 * Three days before the $1 week turns into the paid plan.
 *
 * Says the amount, the date, that it is automatic, and the cancel path, in
 * the first four lines. Anything vaguer is the email people screenshot next to
 * the word "sneaky", and UK consumer rules expect exactly this reminder.
 *
 * `amount` is what Stripe will charge ("$49"), `interval` the billing period,
 * both read off the subscription by the webhook, never assumed.
 */
export function trialEndingEmail(
  name: string,
  endsOn: string,
  amount: string,
  interval: 'year' | 'month',
): EmailTemplate {
  return {
    subject: `Your songdrafts plan starts on ${endsOn}`,
    text: `Hi ${name},

Your $1 week ends on ${endsOn}. On that day your plan starts automatically
and we charge ${amount}, then ${amount} every ${interval} after that until you
cancel.

If that is not what you want, cancel before then in Settings, under Plan, and
nothing more is charged.

If you do stay: your songs are on your device either way. What you are paying
for is that they sync between your machines and are backed up somewhere that
is not a phone you might drop.

${SIGN_OFF}`,
  }
}

/**
 * Payment failed.
 *
 * The important sentence is the second one. Someone whose card expired has not
 * decided to leave, and telling them their work is locked when it is not is
 * how a fixable billing problem turns into a cancellation.
 */
export function paymentFailedEmail(name: string): EmailTemplate {
  return {
    subject: 'Your card was declined',
    text: `Hi ${name},

Your last payment did not go through, which is nearly always an expired card.

Your board still works. Nothing is locked and nothing has been deleted. You
can update the card in Settings, under Plan, and that is the end of it.

${SIGN_OFF}`,
  }
}

/** Cancelled. No win-back plea, no discount, no survey. */
export function cancelledEmail(name: string, endsOn: string): EmailTemplate {
  return {
    subject: 'Cancelled',
    text: `Hi ${name},

That is cancelled. You keep everything until ${endsOn}, and nothing renews
after that.

Before then, take a backup. ${BACKUP_STEPS}

We would rather you had your work than had an account.

If something specific pushed you out, we would genuinely like to know. One
line is plenty.

${SIGN_OFF}`,
  }
}

/**
 * Day 60 after a subscription lapses. The first of two warnings.
 *
 * The tone is deliberately not a win-back. Someone who stopped paying two
 * months ago has decided; pressing them here would make the warning read as a
 * pretext for a sales email, and then the day 85 one gets ignored too. The
 * only job is that nobody is surprised on day 90.
 *
 * It leads with the thing that is NOT happening, because the fear the subject
 * line creates is that the songs are going. They are not. The cloud copy of
 * the audio is.
 */
export function audioExpiring60Email(name: string, deleteOn: string): EmailTemplate {
  return {
    subject: `Your songdrafts audio, and what happens on ${deleteOn}`,
    text: `Hi ${name},

Your subscription ended a couple of months ago, so this is the first of two
notes about the audio we are still holding for you.

Your songs are not going anywhere. Titles, notes, lyrics, tags and comments
stay on your board whether you subscribe again or not. What gets removed on
${deleteOn} is our copy of the audio files, which is the part that costs money
to store.

Recordings you imported on a device, or downloaded to it, are on that device
and are not affected. Anything that only ever lived in our cloud, like a take
recorded on your phone and opened on your laptop, is what goes.

To keep all of it, there are two ways:

  1. Take a backup. ${BACKUP_STEPS.replace(/\n/g, '\n     ')}
     It costs nothing.

  2. Subscribe again, and everything carries on as it was.

We would take the backup either way. We will write once more on day 85.

${SIGN_OFF}`,
  }
}

/**
 * Day 85. Five days left, and the last one.
 *
 * Shorter on purpose. The reasoning was in the first email; repeating it here
 * buries the date, and the date is the entire content of this message.
 */
export function audioExpiring85Email(name: string, deleteOn: string): EmailTemplate {
  return {
    subject: 'Five days left on your songdrafts audio',
    text: `Hi ${name},

Last note on this. On ${deleteOn} our copy of your audio files is deleted.

Your songs stay: titles, notes, lyrics, tags and comments are all still on the
board afterwards. It is the recordings themselves that go, unless they are
already on one of your devices.

To keep every recording: ${BACKUP_STEPS} It takes a few minutes and it is
free.

Subscribing again keeps everything as it is.

${SIGN_OFF}`,
  }
}

/**
 * Day 90, after the fact.
 *
 * Sent because a deletion nobody confirms is a deletion nobody trusts. It is
 * also the one message here that has to be accurate about what is left, since
 * it is the one that gets checked against the board.
 */
export function audioDeletedEmail(name: string): EmailTemplate {
  return {
    subject: 'Your songdrafts audio has been removed',
    text: `Hi ${name},

As the last two emails said, our copy of your audio files has now been
deleted. That is done and it is not reversible from our side.

Your board is still there. Every song, with its title, notes, lyrics, tags and
comments, is exactly where you left it. Takes whose audio only lived in our
cloud are listed with no audio attached.

Any recording that was on one of your devices, because you imported it there
or downloaded it, is still on that device and was never touched by this.

If this is a mistake, or the warnings went somewhere you do not read, reply
and tell us. We cannot undo it, but we would like to know how it happened.

${SIGN_OFF}`,
  }
}

/**
 * The plainest HTML that will not look broken in Gmail, Outlook or Mail.
 *
 * A table-based template is the standard answer and it is not needed here:
 * there is no layout to hold together, only paragraphs. Left as system fonts
 * on purpose, because a webfont in an email is one more thing to load and
 * fail.
 */
export function toHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2320;max-width:34em">
${paragraphs}
<p style="margin:28px 0 0;font-size:12px;color:#6b7671">
songdrafts. Reply to this and the team reads it.
</p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
