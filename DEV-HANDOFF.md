# songdrafts: dev + marketing handoff

30 August 2026. Everything here is verified against the live site and the repo on
the date above. Companion docs in this repo: `RESEARCH-REDDIT.md` (evidence, 25
Reddit threads) and `PRODUCT-BRIEF.md` (fuller reasoning, has a status header).

---

## 0. CONTEXT. Read this before touching anything.

**What it is.** A local-first Kanban board for songwriters. Voice memos come in on
the left as raw ideas, get dragged right as they get better, and come out the other
end as finished demos you can send to someone. Repo is `Projects/memo`, the product
is called songdrafts, live at songdrafts.com, currently "Not open yet" with no email
capture by choice.

**Who it is for.** Songwriters with hundreds of untitled voice memos, not audio
engineers. This distinction is the single most important thing in this document.
There are two markets and we are only in one of them:

- **Songwriters (ours).** Badly served, actively complaining, inventing their own
  systems in Trello and Apple Notes. Kanban is something they independently invent.
- **Engineers delivering mixes to clients (not ours).** Owned by Samply, which is
  entrenched and loved. Kanban was pitched to that market directly and rejected:
  "version approval is just not a pain point". Do not build for them, do not market
  to them.

**The positioning, in one line.** You already built this in Trello, and Trello
cannot hear it.

**The tone.** Plain, specific, slightly dry, never hyped. The page concedes things:
a row of the comparison table goes against us and stays in, the discipline section
agrees with our own harshest critic before answering him. That honesty is the brand.
Do not add superlatives, do not add exclamation marks, do not write "effortlessly"
or "seamlessly" or "supercharge".

**Standing copy rules:**
- **No em dashes, anywhere, ever.** Owen's rule. Use a full stop, a colon, or rewrite.
- **Never publish a number about Owen that he has not confirmed.** The page carried
  an invented "1,247 voice memos" for a day. His real count is 247. He has roughly
  500 pre-sort but not a clean count, so that number stays off the page.
- Second person. The reader is "you". The product is "songdrafts", lowercase, always.

---

## 1. PRICING. Approved by Owen. Do this first.

**Change to $49/year, keeping $9/month.**

Why: the research has real figures people said out loud. Hobbyist songwriters cap out
around EUR 40/year. An artist-side competitor charges $49/year. A working mix engineer
pays $28/month for Samply happily, because it is a business cost, and that person is
not our buyer. Evernote shed users at $130/year. At $9/month we are $108/year, which
sits above the songwriter band and below the professional band. Nothing in 25 threads
suggests a songwriter pays $108/year for organisation alone. $49/year lands exactly on
the observed artist-side price.

**File:** `src/pages/LandingPage.tsx`, `<section className="pricing" id="pricing">`.

Replace the heading, sub and not-live paragraph with:

```jsx
<h2 className="section-h2">$49 a year. <em>Or $9 a month.</em></h2>
<p className="section-sub">
  Everything included, one plan: the board, sync across your devices, offline,
  take-stacking, share links with timestamped comments. Cancel in one tap.
</p>
<p className="pricing-not-live">
  A year costs less than five months of monthly, because most people writing songs
  are not putting this on a company card. Not open yet, and there is nothing here to
  pay with. When it opens it will be $49/year or $9/month, first week $1.
</p>
```

Leave the "What happens if I stop paying?" block underneath exactly as it is.

**Also update** any other place the price appears. Grep for `$9` across `src/` and
check the FAQ and the sign-in page before you finish.

---

## 2. PULL THE "SHUTS DOWN" FAQ. Owen rejected it and it shipped anyway.

**File:** `src/pages/LandingPage.tsx`, the `FAQS` array. Delete this entry entirely:

> q: 'What if songdrafts shuts down?'

Owen's words: "let's not do #2 as dont want to cause fear". It reached the page because
a session read the brief after he had said no. Pre-launch, with no track record, a
heading containing the words "shuts down" plants the doubt instead of settling it.

If the reassurance is wanted, and only if, append one sentence to the EXISTING
"What if I stop paying?" answer. Never as its own question:

> Your audio is on your device, so cancelling doesn't take anything away from you.
> Sync and sharing go quiet until you come back. The zip export works whatever
> happens, so the library is never trapped anywhere.

---

## 3. FONTS. Three faces, one is starving.

**The system, defined in `src/styles/tokens.css`:**

```
--font-serif: 'Instrument Serif', serif        headlines, the emotional voice
--font-sans:  'Bricolage Grotesque', sans-serif  the wordmark, feature titles, step titles
--font-mono:  'DM Mono', monospace              labels, data, the app's UI language
```

**The problem.** In `src/styles/landing.css` Bricolage appears 9 times against DM
Mono's 45. Mono is doing two different jobs and only one is right:

- **Correct, leave alone.** Mono as the product's interface language: the LiveBoard
  mockup (`.lb-col-name`, `.col-header`, `.card-meta`, `.card-time`, `.card-tag`),
  `.tick`, `.kanban-col`, `.preview-speed-pill`. This makes the fake board read as
  real software and matches the actual app. Do not touch any of it.
- **Wrong, fix it.** Mono as editorial furniture: prose and product names wearing an
  interface costume.

**Change these two:**

`.compare-col` (the table column headers). This is the clearest error on the page.
Those cells contain "Voice Memos", "Apple Notes", "Trello", "Tape.it": real product
names set in monospace, which makes competitors look like variable names.

```css
.compare-col {
  font-family: 'Bricolage Grotesque', sans-serif;   /* was 'DM Mono', monospace */
  font-size: 0.72rem;                                /* was 0.62rem */
  letter-spacing: 0.02em;                            /* was 0.06em */
}
```
Sans needs less tracking and can carry more size than mono at the same optical weight.
Check the table still fits at six columns after the change, see section 4.

`.compare-footnote`. Running prose in monospace. Move to `var(--font-sans)`, keep the
size and colour.

**Already done, do not redo:** `.step h4` is already Bricolage.

**Judgement calls, ask Owen:** `.section-label`, `.hero-platforms`,
`.discipline-credential`. The mono uppercase eyebrow is a deliberate signature and
there is a real argument for keeping all three. I would keep them.

---

## 4. THE WORDMARK AND THE MARK.

**Assets:** `public/brand/wordmark-paper.svg` (for dark), `wordmark-ink.svg` (for
light). Full pack, including the app icon, is at
`~/Downloads/songdrafts-logo-pack/`.

**SETTLED, do not reopen.** The Instrument Serif wordmark was tried and rejected. It
is in the pack at `songdrafts-logo-serif/`. It failed because the letters ride a sine
wave that reads as a baseline bug rather than as intent, the ring "o" is visually
lighter than the letters around it so it reads as a hole punched in the word, and
Instrument Serif's airy lowercase reads as a fashion masthead rather than a tool.
The serif stays as the page's voice. It is not the mark.

**THE JOB.** The nav wordmark renders at 131 x 22px. At that size the four thin
waveform bars inside the "o" collapse into a textured dot, so the one distinctive
element in the mark disappears exactly where it is seen most. The app icon does not
have this problem because its bars are far chunkier.

Add a small-size variant in `public/brand/` drawn at the app icon's bar weight,
used in the nav and the favicon. Keep the detailed version for large placements.
Three thick bars instead of four thin ones is fine if four will not hold.

**Do not remove the waveform.** Without it the mark is a word in an ordinary
geometric sans, with nothing ownable and a favicon that is just a letter.

**The app icon is the strongest asset in the identity and must not change.** Solid
disc, four bars in the stage ramp colours, so the icon encodes the product's whole
idea: songs travel from cold blue to finished green. It holds at 1024px and still
reads at 32px.

---

## 5. COLOUR. The identity is locked. Read the header of tokens.css before editing.

`src/styles/tokens.css` opens with "songdrafts identity, LOCKED (brief 03, 25 Aug
2026)" and lists rules that are meant to outrank later requests. Honour them:

1. **One accent element per screen.** The playing card or the primary button, never
   both loud.
2. **Gradients are rationed to three surfaces:** the playing card and player bar, the
   share-page hero, the landing hero. Never per-card covers.
3. **The neon band is forbidden.** Nothing in the `#00ff9d` / `#1DB954` zone.
4. **Theme follows the OS.** Dark is the identity, light is the same identity turned
   over, not a bleached version.
5. **Never put `--text` on an `--accent` fill.** Use `--accent-on`.

**Dark, primary:**
```
--bg #0d1f27   --surface #1b3a46   --text #eef5f2   --text-muted #a3bab7
--accent #9ddbad   --accent-on #0e1f26
ramp  --stage-inbox #51a0a9  --stage-ideas #66baaf  --stage-half #8ed2b2  --stage-done #bbe6b8
```

**Light:**
```
--bg #dce9e2   --surface #edf5ef   --text #0f2b2e   --text-muted #37544f
--accent #146b4f   --accent-on #f3f8f1
ramp  #2f6f9e  #12706b  #2f7440  #5c6d16
```

Every ratio in that file is measured, not aspirational. If you change a value,
re-measure it and update the comment. There is a history of contrast regressions on
this page: the luminous bands have gradient backgrounds and therefore no computed
`background-color`, so naive contrast scripts walk up to the dark body and report
nonsense. Measure against the band's darkest stop by hand.

**Opportunity worth taking.** The ramp colours, cold blue through to alive green, are
the strongest connective tissue in the identity and they currently live mostly in the
app and the icon. More of that journey on the landing page would tie the whole thing
together far better than any font change.

---

## 6. BLOCKED. Do not ship from the research alone.

**The Apple voice isolation section.** A Reddit user documented five recordings ruined
by Voice Memos applying AI voice isolation, their voice captured perfectly and
everything else destroyed, with the switch buried in Settings, Accessibility, Audio
and Visual. If true this is the strongest ad angle we have, because it is the
incumbent damaging our exact use case.

**It must be reproduced on a real iPhone on current iOS before a word of it is
published.** Do not write it from the thread. Full copy is drafted in
`PRODUCT-BRIEF.md` section 2a if it checks out.

Related: the trust section now claims "We never touch the audio. The file you import
is the file we store". Verify the import path does not transcode before leaving that
on the page.

---

## 7. MARKETING.

**Copy bank:** Part 8 of `RESEARCH-REDDIT.md`, plus the wave 2 additions further down.
All of it is written in the voice above and derived from what real songwriters said.

**The two angles that test best:**

*The number.* Their voice memo count is a badge they already wear, not a shame. When
one poster said 47, replies piled in flexing 754 and 4,000. Lead with recognition:

> New Recording 4,182. Somewhere in there is the single.
> You have 1,224 voice memos. You have released four songs.

*Trello.* Five separate threads, one person recommending the same setup three times
across two years. They have already built our product by hand:

> You already built this in Trello. Trello just cannot hear it.
> Your board does not know what a waveform is.

**Meet the objection, do not dodge it.** The loudest recurring reply in r/Songwriting
is "your problem is not organisation, it is discipline". Run it as its own campaign:

> An app will not give you discipline. It will stop you losing the ones you were
> disciplined about.

**Posting rules, learned from watching three founders fail in these exact threads.**
One replied to every comment in his own thread with the same pitch, was downvoted
throughout, then posted asking why. Another had his post dissected line by line as a
marketing funnel in the top comment. The one who succeeded opened with a decade of his
own mess, named the pain precisely, mentioned his tool once mid-comment, then asked
the reader a question. Do that. Never repeat the pitch twice in one thread.

**NEVER:**
- Post in r/audioengineering. Wrong market, hostile to artist-side tools, two
  separate builders were told they were in the wrong forum.
- Use AI-generated imagery. A founder in these threads was told plainly his AI images
  were off-putting, as honest feedback, by someone who otherwise liked his product.
- Add AI generation to any writing surface. This audience is openly hostile to it and
  our "nothing you record trains an AI" line is an asset worth protecting.
- Say "built by songwriters for songwriters". Deadest line in the category.
- Publish a figure about Owen without confirming it with him first.

**Owen's record, for credibility placements only:** two million streams, BBC
Introducing, sold out rooms in the UK and Europe, features in Earmilk and Wonderland.
It currently sits in the discipline section, deliberately not the hero. The hero works
because it stands level with the reader; a streams count there turns him into someone
selling down to them, which is exactly what that audience punishes. Streams and
sold-out rooms prove he finishes songs. The press hits do not, so they are left out.

---

## 8. OPEN QUESTION FOR OWEN, not for you to decide.

The page says "no list to join, and nothing here is collecting your email". That is a
deliberate choice, made because there was no confirmation email behind the old
waitlist and a page promising "delete means delete" should not quietly pocket
addresses. It is honest and it is costing us. People in these threads are asking for
this exact product right now and we cannot catch one of them. If marketing starts
before the product opens, this needs revisiting, and it needs a real confirmation
email built before it does.
