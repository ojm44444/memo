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
  /** An optional button under the message. */
  cta?: { label: string; url: string }
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
 *  - The trial-ending reminder is gone with the trial itself (15 Sept):
 *    checkout now charges the full price up front, so there is no free or $1
 *    period to warn about.
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
    subject: 'Welcome to songdrafts',
    cta: { label: 'Open songdrafts', url: 'https://www.songdrafts.com/app' },
    text: `Hi ${name},

Welcome to songdrafts. Your board is ready.

The one thing to do first is get your recordings in. The guide inside songdrafts walks you through it for your device. The short version:

iPhone: in Voice Memos, tap a recording, then Share, then Save to Files. Then open songdrafts on your phone, tap + Import audio and pick them. They sync to your computer on their own.

Mac: open Voice Memos and give iCloud a minute to sync. Press Cmd+A to select everything, drag it into a new folder on your Desktop, then drag that folder onto the Songwriting board.

Windows: drag audio files, or a whole folder, onto the board.

Keep everything in Voice Memos. We do not recommend deleting anything there. It is where your recordings live, and songdrafts is where they get sorted. songdrafts also remembers the last recording you brought in, so you can find that spot in Voice Memos and bring in only what is newer.

We know this looks like a lot of work. The first batch takes a few minutes, and after that you only bring in new recordings, which gets quicker every time. We are building an app that lets you share straight from Voice Memos. Until it is ready, this is the fastest way that works.

If anything does not work, reply and tell us what happened. It is the part we most want to hear about.

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
    cta: { label: 'Open songdrafts', url: 'https://www.songdrafts.com/app' },
    text: `Hi ${name},

Your board is still empty, which usually means the import got stuck rather than that you changed your mind.

If your memos are on your iPhone: in Voice Memos, tap Edit, tick the ones you want, then Share, then Save to Files. Open songdrafts on the phone, tap + Import audio and pick them. Do it on the phone even if you mainly use a computer, because they sync across.

If you use a Mac: open Voice Memos, let iCloud finish syncing, press Cmd+A, drag everything into a new folder on your Desktop, then drag that folder onto the board. On Windows, drag the files or folder straight onto the board. Anything that is not audio is ignored.

Leave your recordings in Voice Memos. Nothing needs deleting.

It is fiddly the first time and quicker after that, and a proper app for this is on the way. If you got stuck somewhere, reply and tell us what you saw. We would rather fix it than have you quietly give up on it.

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
 * Branded but plain: a serif wordmark, one card, one optional button. Inline
 * styles only and no images, because email clients strip everything else
 * (SVG does not render in Gmail). Single line breaks in the text are just
 * wrapping, so they are joined; blank lines start a new paragraph.
 */
export function toHtml(text: string, cta?: { label: string; url: string }): string {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`)
    .join('\n')

  const button = cta
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#1d6a4c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${escapeHtml(cta.label)}</a></p>`
    : ''

  return `<div style="background:#f6f3ec;padding:28px 12px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e2d6">
<div style="background:#e3f1ea;padding:20px 28px;border-bottom:1px solid #d3e6db">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-0.3px;color:#1d6a4c">songdrafts</span>
</div>
<div style="padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1c2320">
${paragraphs}
${button}
</div>
<div style="padding:16px 28px;background:#faf8f3;border-top:1px solid #efeadd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7671">
songdrafts, for people who write songs. Reply to this email and a person reads it.
</div>
</div>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
