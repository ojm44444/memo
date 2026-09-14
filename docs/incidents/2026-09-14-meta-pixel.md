# Incident: unconsented Meta pixel, share and invite tokens sent to Meta

Recorded 14 September 2026. Status: contained. Open items at the end.

## Summary

From 22 June to 14 September 2026, songdrafts.com loaded a Meta pixel on every page, with no consent,
while the privacy page said the site had no trackers. Because the page that carried it is served for
every URL, it also ran on share links and bandmate invite links, and a pixel reports the full page
address to Meta, so those links' secret tokens were sent to Meta. No customer was affected: nobody
outside the team had used the product. The tokens exposed were three test share links and one
expired invite.

## What happened

| When (UK time) | What |
|---|---|
| 21 Jun 2026, 11:48 | A Meta dataset (pixel) named **"memo"**, id **2289145585190818**, was created. Evidence: a listing of Meta datasets in another of Owen's Claude sessions (FAN FLOWY) shows `"dataset_id":"2289145585190818","name":"memo","creation_time":"2026-06-21T03:48:48-0700"`. "memo" was the product's name at the time. |
| 22 Jun 2026, 14:48 | Commit `87742811cefbcd7f9f346dead24465dcda945027`, author Owen Mellett, co-authored by Claude Sonnet 4.6, titled "Fix drag-and-drop race condition". It was a 49-file, 2,989-line commit. Among unrelated work (icons, the playlist share page, `notify-share-feedback`) it added SEO and social tags to `index.html` and, with them, the pixel script `fbq('init', '2289145585190818'); fbq('track', 'PageView')` and a `<noscript>` image beacon. No consent handling. |
| 22 Jun to 14 Sep | The pixel ran on every route. `index.html` is served for all URLs by the Vercel rewrite, so it ran on `/share/<token>`, `/invite/<token>` and `/playlist/<token>` as well. |
| 14 Sep 2026 | Found while adding Owen's new pixel (1609391504053938). Confirmed live on the home page and on a share URL. Removed. |
| 14 Sep 2026, 22:03 | The three exposed share links revoked. |

## What was sent, and to whom

- **To:** Meta, into dataset 2289145585190818 ("memo").
- **On every page view, for every visitor:** the page address, referrer, browser details, IP address
  (as part of the request), and Meta's `_fbp` cookie identifier. That is personal data for any
  visitor, sent without consent, for roughly twelve weeks.
- **On share and invite pages, additionally:** the secret token inside the page address.

Not sent: audio, song titles, lyrics, account emails, or anything inside a board. The pixel was the
standard base snippet with only PageView; there was no advanced matching configured in code.

## Exposure

Tokens sent to Meta (only links that were actually opened send a PageView):

| Link | Share id | Token begins | Opened | Status |
|---|---|---|---|---|
| Song share: Poem | `c4d2b6a1-e17c-4471-bd41-b930078e021a` | `0921` | 2 times, 8 Sep | Revoked 14 Sep 21:03 UTC |
| Song share: A256 | `0b96f1b6-edc2-461b-bfba-66196972e92e` | `b3bd` | 2 times, 8 Sep | Revoked 14 Sep 21:03 UTC |
| Song share: not stick season | `2fa8ce1e-a0f6-4a5e-8882-1b5aa12eb33f` | `86ea` | 2 times, 8 Sep | Revoked 14 Sep 21:03 UTC |
| Bandmate invite to Owen's own address | (board_invites, created 11 Jun) | not recorded | unknown | Already expired |

All three shares were test links created on 8 September by Owen and the consultant. Playlist
shares: none have ever existed.

**Visitors in the window: not known from our side.** Vercel Web Analytics is not enabled on the
project (the API reports no Web Analytics and the collection endpoint returns 404), so nothing was
counted. The only record of visits is the "memo" dataset itself, in Meta Events Manager. It can give
event counts over the window; it will not give a reliable UK and EU split.

## Why it happened

1. A tracking snippet was added as part of a large, unrelated commit, so it was never reviewed as
   what it was.
2. It went into `index.html`, the one file served for every route, including routes whose URLs are
   secrets.
3. Nothing checked the privacy page's claims against the code. It said "no trackers" for twelve
   weeks with one loading on every page. Two landing-page audits did not catch it.

## Remediation (done, 14 Sep)

- Old pixel and noscript beacon removed from `index.html`, with a comment saying never to put a
  pixel there. Verified gone from the live home page and a live share URL.
- Replacement pixel (1609391504053938) in `src/lib/metaPixel.ts`: loads only after the visitor
  presses Allow; never on share, invite, playlist or admin routes; no page views inside the app;
  Meta's automatic event collection off (`autoConfig false`); Meta's automatic single-page-app page
  views off (`disablePushState`), which would otherwise have leaked a token on in-app navigation.
  Verified against the real requests to `facebook.com/tr`.
- Privacy page rewritten and dated 14 September: what Meta receives, what it never receives, the
  cookie, and how to say no. Cookie settings link in the footers.
- The three exposed share links revoked. Owen reissues any he still needs from the Share button.

## Open

1. **Ownership of 2289145585190818.** The dataset listing points to Owen's own Meta account. Owen to
   confirm in Business Manager. If it is his, the tokens went to his own dataset and to Meta as its
   processor. If it is not, submit a data deletion request to Meta for the events concerned.
2. **Visitor count for the window:** read from Events Manager for dataset 2289145585190818, and add
   here.
3. **Whether anything further is owed** (for example to the ICO) for twelve weeks of unconsented
   tracking of site visitors: a question for the solicitor already being engaged for the terms.
4. Consider deleting or disconnecting the "memo" dataset once the counts are read, so it cannot be
   reinstalled by mistake alongside 1609391504053938.
