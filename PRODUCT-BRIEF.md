# songdrafts: product brief from Reddit research wave 2

Written 30 August 2026. Source of evidence: `RESEARCH-REDDIT.md` (25 threads).
Audience: whoever picks up the landing page and app next.

**Wave 1 is already shipped and deployed.** Commits `cb627d3` and `51e8e48` raised the
numbers, rebuilt the compare table around Voice Memos and Apple Notes, added the discipline
section, made the columns copy say they are renameable, reframed speed as triage, and shipped
lyrics. Verified in the live bundle: `1,247`, `New Recording 612`, `Rename the columns`,
`Apple Notes`, no `Suonote`. Do not redo any of it.

Everything below is new, from wave 2 only.

---

## P0. One decision, not a build task

### Pricing needs a call before launch

Real numbers people said out loud in these threads:

| Who | What they pay or would pay |
|---|---|
| Hobbyist songwriter | about EUR 40/year, and no more |
| Artist-side competitor | $49/year per artist slot |
| Working mix engineer | $28/month for Samply, happily, as a business cost |
| Evernote leavers | left at $130/year |
| Repeated ask | a bigger free tier, not a lower price |

songdrafts is $9/month, which is $108/year. That sits above the songwriter band and below
the engineer band. The engineers will pay it and are explicitly the wrong market (see the
two-markets section of the research). The songwriters are the right market and are the
price-sensitive one. Nothing in 25 threads suggests a songwriter pays $108/year for
organisation alone.

Three options, pick one:

1. Annual plan at $49 to $59, monthly stays $9. Matches the band exactly.
2. A real free tier with a song cap, priced plan above it. This is the most requested shape.
3. Hold $9 and position explicitly for the serious songwriter, and say so on the page.

I would take option 1. It needs no new product surface and it lands inside the evidence.

**Where:** `src/pages/LandingPage.tsx`, `section.pricing` (line ~551), plus the
"What if I stop paying?" FAQ.

---

## P1. The Trello change. Biggest finding in wave 2.

Trello appeared unprompted in **five** r/Songwriting and r/musicmarketing threads, and one
user recommended it in three separate threads across two years, each time describing the
same thing: a board, columns for stage of production, one card per idea, **audio attached
to the card**, colour labels, and a fresh mp3 attached on every iteration.

Songwriters are already hand-building songdrafts inside a project management tool. That is
much stronger evidence than anyone saying they would use it, and Trello is currently absent
from the page entirely.

### 1a. Swap Dubnote out of the compare table, put Trello in

**Where:** `src/pages/LandingPage.tsx`, `COMPARE_ROWS` (line ~79), and the table header in
`section.compare` (line ~458).

Dubnote was named once across 25 threads. Trello was named five times. Straight swap, and
the table stays at five columns so it does not become a spreadsheet again.

Replace the `dubnote` key with `trello` and set these values:

| Row | trello |
|---|---|
| A board your songs move across | `true` |
| Every take stacked on one song | `false` |
| Lyrics and the recording together | `'partial'` |
| Merge two half-songs into one | `false` |
| Key and tempo read off the file | `false` |
| Comments pinned to a timestamp | `false` |
| Deleting here is not deleting everywhere | `'partial'` |
| Works fully offline | `'partial'` |
| Recording quality | `false` |

**Give Trello the first row honestly.** It wins that one, and conceding it is what makes the
rest land. The page already leaves three losing rows in and says so; this is the same move.

### 1b. Rewrite the compare section subheading

**Where:** `section.compare`, `p.section-sub` (line ~466). Current copy names Voice Memos,
Apple Notes and a folder. Add the organised segment, because they are the ones who will pay.

Replacement:

> Most songwriters are already running a system. Voice Memos for the humming, Apple Notes
> for the lyrics, a folder somewhere for the bounces, and if you are organised, a Trello
> board with the mp3s dragged onto the cards. It works right up until the pile gets big.
> None of it covers the messy stretch between a voice note and a finished demo, which is
> where songs actually go to die.

### 1c. New feature card: the Trello line

**Where:** `FEATURES` array (line ~9). Add a `small` card.

```
{
  size: 'small',
  icon: '▤',
  title: 'You already built this in Trello',
  desc: 'Cards, columns, an mp3 dragged onto each one. It works, right up until you need to hear it. A board that cannot play audio, stack a take or read a key is a list with attachments.',
}
```

Icon `▤` is a horizontally-ruled square, which reads as a card and sits in the same
geometric family as the existing `▦ ⧉ ✈ ◎ ↔ ♯`. Do not use a Trello logo.

Note the bento layout comment at the top of `FEATURES`: sizes carry hierarchy, so this must
be `small`. Seven cards will need the grid checked at both breakpoints.

---

## P1. Apple is breaking its own app. Verify first.

Two separate gifts from the incumbent.

### 2a. Voice Memos AI voice isolation is ruining instrument recordings

A user documented five recent recordings made unusable: their voice captured perfectly,
everything else destroyed. They were never told the processing was on and could not find
the setting. It lives in Settings, Accessibility, Audio and Visual, Voice Isolation.

**This is the strongest single angle in the entire corpus** because it is concrete, current,
and it is the incumbent damaging the exact use case songdrafts serves.

**Blocking requirement: test this on a real iPhone on current iOS before publishing a word
of it.** I am not asserting current Apple behaviour from one Reddit thread, and neither
should the page. If it does not reproduce, drop the section and keep 2b.

**Where:** new `<section className="isolation">` immediately after `section.backup-section`
(ends line ~435) and before `section.discipline`.

**Reuse the existing two-column component**, do not invent one: `.backup-grid`,
`.backup-col--them`, `.backup-col--us`, and `.backup-col-label`. It is the same rhetorical
shape (what they do, what we do) and it keeps the page from growing another pattern.

Copy:

- Section label: `The other thing nobody tells you`
- Heading: `Voice Memos is optimised for voices.` / em: `Your guitar is not a voice.`
- Sub: `Apple runs voice isolation over your recordings. It is very good at deciding your room, your amp and your acoustic are noise around a voice. Nobody tells you it is on, and the switch is four levels deep in Accessibility.`
- Them column, label `Voice Memos`: `Processing you did not ask for, on by default, applied to a take you cannot record again.`
- Us column, label `songdrafts`: `We do not touch your audio. What you imported is the file we store, the file we play back, and the file that comes out in the zip. Byte for byte.`

Check the last claim against the import path before shipping it. If anything transcodes,
say what actually happens instead.

### 2b. Apple killed Music Memos

Apple built a songwriter-specific recording app and discontinued it. Users still ask for a
replacement in r/iosapps and get told it is gone.

One line, no new section. Best home is the compare section sub or the isolation section:

> Apple made an app for songwriters once. They deleted it.

---

## P1. Two gaps that cost sign-ups

### 3a. "What if you disappear" belongs in the FAQ

A user said plainly they stick with Dropbox because small companies get bought, overcharge,
or cease to exist. This is a real objection to a one-person product and the zip export
already answers it. Right now that answer is buried inside "What if I stop paying?", which
is a different worry.

**Where:** `FAQS` array (line ~101). New entry, place it last.

```
{
  q: 'What if songdrafts shuts down?',
  a: 'Fair question to ask a small product. Your audio is already on your device, not held hostage on a server, and you can pull the whole library out as a zip whenever you want, including after you cancel. If this disappears tomorrow you still have every recording, in a plain folder, playable in anything.',
}
```

### 3b. Say what platforms this runs on, above the fold

Wave 2 has people on Android phone plus Mac, and Windows plus iPhone. One asked for MacBook
plus Android specifically. Obsidian was rejected in one thread purely because free-tier sync
does not cross devices. The current page only answers this in a buried FAQ.

**Where:** `p.hero-trial-note` (line ~281), which currently reads "Keep recording in Voice
Memos. songdrafts is what happens next."

Add a second short line under it, or extend it:

> Runs in the browser on any desktop, and on your phone. Nothing to buy from the App Store.

Only ship this once it matches what actually works. The existing FAQ says import via the
Files app on iPhone plus mobile browser, so word it to that, not beyond it.

---

## P2. The naming feature. Genuinely delightful, grounded in their own advice.

Three users independently gave each other the same trick: stop using descriptive filenames,
give every idea an **absurd, memorable name** and keep it for the life of the idea. The
reasoning, from the fullest version: "waltz in D 6/8 no. 6" means nothing to you later,
whereas an absurd two-word name is instantly recognisable to you and to your band.

Step 02 currently asks the user to type a name and justifies it with ten seconds now saving
two years of scrolling. That is correct but it is asking for typing at the exact moment
nobody wants to type.

**Proposal.** On every imported card, suggest an absurd two-word name, editable, one tap to
accept. Local word lists, no model, no network. It solves the blank field, it is the advice
real songwriters give each other, and it is the kind of detail that gets a screenshot posted.

**Where:**
- Generator: new `src/lib/absurdNames.ts`, two arrays and a seeded pick. Seed from the
  song id so the same card always suggests the same name and it never changes under them.
- Surface: the import path, alongside `importAudioFiles`. Find it via
  `src/components/board/` import cards.
- Landing copy: `STEPS` (line ~96), step `02`.

Step 02 replacement:

> **Give it a name**
> songdrafts suggests one, and it will be something like Unicorn Pants. Keep it or type your
> own. You will remember Unicorn Pants. You will never remember New Recording 612.

Word list rule: absurd but never crude, and never anything that reads as a real song title.
Two words, concrete noun plus unrelated concrete noun.

---

## P2. Three smaller ones

### 4a. Tuning on the card

The single most vivid failure story in the corpus: 50 hours on a guitar piece in an
alternate tuning, 70 near-identical memos, tuning never written down, piece now unplayable.

Key and BPM are read off the file automatically, which is right. Tuning cannot be, so it is
a plain optional text field on the card, next to key and BPM. Cheap, and it has a story
behind it that nothing else on the card has.

Caution from a senior audio commenter in wave 2: heavy metadata entry is a duplicate database
problem, more typing and more conflict. So keep this to **one** free-text field. Do not add
a metadata panel.

**Icon:** `♭` (♭). It pairs exactly with the existing `♯` (♯) on the key and tempo
card and needs no explanation.

### 4b. Reframe filtering as finding

"Search by what I sang" was called the dream in one thread. songdrafts has key and BPM
filtering, currently framed in `section.merge-band` (line ~345) as filtering.

Do not claim content search, it is not built. Reframe the existing feature:

> When you are hunting the one in D at 92bpm, stop scrolling and just ask for it.

### 4c. Keep saying the listener needs no account

Validated hard from the engineer market, where Samply's decision to push listeners into
making an account is the most complained-about thing about it, repeatedly, by professionals
who say it makes them look unprofessional to A&R and managers. songdrafts already does the
right thing here and says it once, inside a feature card. Worth saying louder.

---

## What NOT to do

- **Do not market songdrafts in r/audioengineering.** Two separate builders posting
  artist-side tools were told they were in the wrong forum. Hostile, wrong audience.
- **Do not chase the Samply market.** Kanban was tested there directly and rejected:
  "version approval is just not a pain point". That market is saturated with more than
  twenty named products and Samply is genuinely loved.
- **Do not add AI generation of any kind to the writing surfaces.** One founder was told
  plainly to drop it, another was interrogated on why they had integrated AI at all, and a
  competitor positions explicitly on not generating lyrics for you. The existing
  "nothing you record trains an AI" line is an asset. Protect it.
- **Do not add AI-generated imagery to marketing.** A founder in these threads was told
  directly that his AI images were off-putting, as honest feedback, by someone who otherwise
  liked the product.
- **Do not add a metadata panel.** See 4a.

---

## Suggested order

1. Pricing decision (P0, blocks launch, no code)
2. Trello: table swap, sub rewrite, feature card (P1, half a day, highest evidence)
3. FAQ shutdown answer and platform line (P1, an hour, both are conversion blockers)
4. Verify voice isolation on a real device, then write the section or drop it (P1)
5. Absurd name generator (P2, the fun one, most likely to get shared)
6. Tuning field, finding reframe (P2)
