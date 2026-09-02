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

const SIGN_OFF = 'Owen'

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

The whole thing only works once your recordings are in it, so start there. On
a Mac, open the Voice Memos app, select everything, and drag it onto the
Inbox column. On an iPhone, share the memos to songdrafts. It reads the file
names and dates, and nothing gets re-encoded or converted on the way in.

Then move one song to the right when it gets better. That is the entire idea.
Nothing expires, nothing nags you, and there is no streak to keep.

If the import does not work on your setup, reply to this and tell me what
happened. It is the part I most want to hear about.

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

If your memos are on your phone and not your computer, they have to come
across first. On iPhone, open Voice Memos, select them, tap share, and pick
songdrafts.

If you are on a Mac and dragged a folder that did nothing, the memos are
probably still inside iCloud rather than downloaded onto the machine. Opening
each one once pulls it down.

If it was neither of those, reply and tell me what you saw. I would rather fix
it than have you quietly give up on it.

${SIGN_OFF}`,
  }
}

/**
 * Trial, day 5 of 7.
 *
 * Says the number, the date and the cancel path in the first three lines.
 * Anything vaguer is the email people screenshot next to the word "sneaky".
 */
export function trialEndingEmail(name: string, endsOn: string): EmailTemplate {
  return {
    subject: 'Your songdrafts trial ends ' + endsOn,
    text: `Hi ${name},

Your trial ends on ${endsOn}. After that it is $49 for the year, or $9 a
month if you would rather go month to month. Nothing happens without that.

If it is not for you, cancel in Settings, under Plan. It takes one click and
you will not hear from me about it again.

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

Before then, go to Settings and export a backup. It is a ZIP with your audio
files and a readable list of your songs, so it stays useful whether or not you
ever open songdrafts again. I would rather you had your work than had an
account.

If something specific pushed you out, I would genuinely like to know. One line
is plenty.

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

If songdrafts is still on a computer you use, the recordings are already
there. Nothing you do now changes that, and this email does not apply to them.

If it is not, and you want the audio back, there are two ways:

  1. Open Settings and export a backup. That gives you a ZIP with the audio
     files and a readable list of your songs, and it works whether or not you
     ever open songdrafts again. It costs nothing.

  2. Subscribe again, and everything carries on as it was.

I would take the backup either way. I will write once more on day 85.

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
board afterwards. It is the recordings themselves that go.

Settings has an export that gives you a ZIP of the audio and a readable list
of the songs. It takes a minute and it is free. If songdrafts is still on a
computer you use, you already have the files and this does not affect you.

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
comments, is exactly where you left it. The takes are listed but have no
audio attached.

If songdrafts is still installed on a computer you used, your recordings are
on that machine and were never touched by any of this. Opening the app there
and subscribing again puts them back in the cloud.

If this is a mistake, or the warnings went somewhere you do not read, reply
and tell me. I cannot undo it, but I would like to know how it happened.

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
songdrafts. Reply to this and it reaches a person.
</p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
