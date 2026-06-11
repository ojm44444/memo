# mem• Roadmap

**Positioning:** Samply helps you present a song when it's done. mem• helps you see all your songs, work on them, and find which is worth presenting — then share from the same place.

---

## Phase 53 — Status region & queue backdrop — ✅ shipped

| Item | Status | Notes for Owen |
|------|--------|----------------|
| 53a Listen empty status | ✅ Done | Filtered empty state uses `role="status"` |
| 53b Share created sr-only | ✅ Done | “Created” read by screen readers on wide rows |
| 53c Queue close describedby | ✅ Done | Backdrop close button references kbd hint |

---

## Phase 52 — Aria-live & share date — ✅ shipped

| Item | Status | Notes for Owen |
|------|--------|----------------|
| 52a Listen filtered aria-live | ✅ Done | Screen readers announce hidden favourite count |
| 52b Share date prefix | ✅ Done | “Created” label before date on narrow rows |
| 52c Queue kbd hint labelledby | ✅ Done | Dialog `aria-describedby` links kbd hint to title |

---

## Phase 8 — Deploy & ops

| Item | Status | Notes |
|------|--------|-------|
| 8a Invite email secrets | 🔶 Setup | `RESEND_API_KEY` + deploy `send-invite-email` |
| 8b Git + GitHub + Vercel | 🔶 Pending | Broken partial `.git` on disk |

---

## Phase 54 — Next up

| Item | Status | Notes |
|------|--------|-------|
| 54a Listen status label | 🔶 Planned | `aria-label` on filtered status region |
| 54b Share date `<time>` | 🔶 Planned | Semantic `<time dateTime>` for share dates |
| 54c Queue close describedby | 🔶 Planned | Panel ✕ close also references kbd hint |

---

## When you're back — quick test checklist

1. **Status region** — filter favourites → empty state has `role="status"`
2. **Created sr-only** — wide share row → VoiceOver reads “Created” + date
3. **Backdrop describedby** — inspect backdrop → references kbd hint
4. **Deploy** — `npm run deploy`

---

*Last updated: Phase 53 shipped.*
