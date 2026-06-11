# mem• — Developer Handoff

**Last updated:** June 2026 (end of Cursor sprint)  
**Repo:** https://github.com/ojm44444/memo  
**Live app:** https://memo-ten-mu.vercel.app  
**Supabase project ref:** `ejwmspvewnkdcwtbofnc`

**Positioning:** Samply helps you present a finished song. **mem•** helps songwriters see all their songs, work on them, find keepers, then share from the same board.

---

## 1. What is complete and working

### Architecture (local-first)

| Layer | Stack | Status |
|-------|--------|--------|
| Client | Vite 8 + React 19 + TypeScript | ✅ |
| Local DB | Dexie (IndexedDB) — songs, columns, projects, audio blobs, outbox | ✅ |
| State | Zustand (`playerStore`, `uiStore`) | ✅ |
| Cloud | Supabase (Postgres + Auth + Storage + Edge Functions) | ✅ wired |
| Sync | Outbox pattern: `enqueueSync` → `flush()` → pull then push | ✅ core path works |
| PWA | `vite-plugin-pwa` (`injectManifest`), service worker, share target | ✅ Chromium; iOS limited (see §2) |
| Tests | Vitest — **6 files, 17 tests**, all passing | ✅ |
| Build | `npm run build` passes | ✅ |

### Deployed / ops (partial)

| Item | Status |
|------|--------|
| Vercel production URL | ✅ https://memo-ten-mu.vercel.app |
| `vercel.json` SPA rewrites | ✅ |
| GitHub repo `ojm44444/memo` | ✅ `main` branch, remote configured |
| GitHub Actions CI (build + test) | ✅ `.github/workflows/ci.yml` |
| GitHub Actions Vercel deploy on push | ✅ `.github/workflows/deploy-production.yml` (needs secrets) |
| Supabase migrations | ✅ 15 SQL files in `supabase/migrations/` (001–015) |
| Invite email edge function | 🔶 Code exists (`supabase/functions/send-invite-email/`), secrets not confirmed deployed |

### Product features (shipped in codebase)

**Board / Kanban**

- Multi-column board with drag-and-drop (`@dnd-kit`), custom sections, column play queue
- Project system: multiple projects per board, templates, library view, project switcher
- Board modes: **Manage** (kanban), **Listen** (favourites playlist), **Library** (all projects)
- Filters, search, bulk selection, pin/archive, project accent colours
- Mobile column tabs + snap-scroll at `≤900px`; auto-scroll to playing column
- Keyboard shortcuts (`useBoardKeyboardShortcuts.ts`), onboarding tour

**Audio**

- Import via file picker, drag-drop (desktop), PWA share target (Chromium)
- Version stacking per song, A/B compare (`VersionCompare.tsx`)
- Waveform player (compact bar + expanded), loop modes, speed, column/favourites queue
- Queue drawer with keyboard nav, focus trap, repeat/shuffle
- Key/BPM auto-import from file tags (`music-metadata`, lazy-loaded)
- Voice Memos folder watch (File System Access API — desktop Chrome)

**Listen / favourites**

- Star songs, favourites view (project + all-projects scope)
- Favourites playlist playback with column sync back to board
- Row UX: double-click title → drawer, tap section → jump to column

**Share / collaborate**

- Public share links (`/share/:token`) with password, download, expiry, labels
- Share preview cards, QR modal, view/listen counts
- Listener feedback + timestamped comments on share page
- Bandmate invites (`/invite/:token`), roles: owner / editor / viewer
- Board members list, remove member, pending invites

**Sync / auth**

- Magic-link sign-in (`SignInPage.tsx`)
- Push/pull sync when signed in and online
- Offline grace period (keep working after implicit sign-out)
- Sync status badge, manual “download cloud audio” in Settings
- Backup export/import (board JSON + audio)

**UI polish (recent phases 30–53)**

- Project accent system (`src/lib/projectAccent.ts`) across board frame, library, listen, columns
- Share link meta badge groups (options / activity / expiry)
- Queue + listen accessibility (`aria-*`, focus restore, live regions)

---

## 2. What is broken, half-finished, or mid-flight

### Git / GitHub / deploy ops

- **Single squashed commit on `main`:** `324d107 Initial commit - End of Cursor Sprint 1` — all sprint work is in one commit; no granular history.
- **README is still the Vite template** — no product runbook, env setup, or deploy docs.
- **GitHub → Vercel auto-deploy** requires secrets not documented in repo:
  - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- **Invite email (Phase 8a):** `send-invite-email` function needs `RESEND_API_KEY` + `INVITE_FROM_EMAIL` in Supabase secrets and deploy:
  ```bash
  supabase secrets set RESEND_API_KEY=re_...
  supabase secrets set INVITE_FROM_EMAIL="mem• <onboarding@resend.dev>"
  supabase functions deploy send-invite-email
  ```
- **PWA icon PNGs missing from `public/`** — manifest references `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png` but only `favicon.svg` and `icons.svg` exist → home-screen icons 404.

### Sync engine — known bugs and fragile areas

**Correctness gaps (multi-device will diverge)**

| Issue | Location | Impact |
|-------|----------|--------|
| Reorder/delete only enqueues moved song | `boardRepo.ts` — `moveSong`, `reorderSongInColumn`, `deleteSong` | Sibling `sortOrder` changes not pushed; column order wrong on other devices |
| `mergeSongsInto` doesn’t sync audio `songId` | `boardRepo.ts` ~L473–516 | Merged versions stay linked to old cloud song |
| `deleteColumn` not synced | `boardRepo.ts` ~L129–140 | Remote column persists after local delete |
| `renameColumn` uses `op: 'create'` | `boardRepo.ts` ~L126 | Works via upsert but semantically wrong |
| Pull can overwrite pending edits | `pullChanges.ts` ~L100–102 | Only protects when `syncedAt === null`; pushed-but-not-flushed edits can lose |
| `lastPulledAt` stored but unused | `pullChanges.ts` | Every pull is full fetch — no incremental sync |
| No outbox deduplication | `outboxRepo.ts` | Rapid updates → duplicate queue rows |
| Failed items retry forever | `outboxRepo.ts` `markSyncFailed` | No max attempts / backoff |

**Board isolation**

| Issue | Location | Impact |
|-------|----------|--------|
| `acceptBoardInvite` doesn’t clear local board | `inviteRepo.ts` ~L104–114 | Joining shared board can **mix** with existing local/seeded data |
| `switchToBoard` does clear | `boardAccess.ts` | Correct pattern — invite flow should match |

**Lifecycle**

| Issue | Location | Impact |
|-------|----------|--------|
| `initSyncEngine` re-registers listeners | `syncEngine.ts` ~L161–184 | No teardown on `BoardPage` remount → duplicate handlers |
| Sync intervals stop off `/app` | `useSyncAuth.ts` cleanup | Leaving board routes pauses periodic sync |

**Audio / storage**

| Issue | Location | Impact |
|-------|----------|--------|
| Storage orphans on delete | `pushChanges.ts` | DB row removed; Storage object not deleted |
| Pull hardcodes `mimeType: 'audio/mpeg'` | `pullChanges.ts` ~L160 | Wrong MIME for non-MP3 |
| Only 4 clips cached per flush | `syncEngine.ts` ~L108 | Large libraries stay cloud-dependent |
| Auto-cache errors swallowed | `audioDownload.ts` | Silent failures; Settings is manual retry |
| Offline cloud-only playback fails | `resolvePlaybackUrl.ts`, `ColumnPlayerBar.tsx` | No blob + offline → playback stops |
| Share blocked until `storagePath` | `SongSharePanel.tsx` | Must upload before share link works |

### Mobile UI — layout issues

| Area | Problem | Files |
|------|---------|-------|
| Board titlebar | No mobile breakpoint; crowded row of mode toggle, search, switcher, filters, select, add section | `BoardPage.tsx`, `board.css` |
| Player bar | Single flex row, no `@media` rules; transport + title + waveform + loop + speed compress on narrow screens | `ColumnPlayerBar.tsx`, `board.css` `.player-bar-inner` |
| App shell height | Fixed header + in-flow banners + `height: 100dvh` on `main` can clip bottom (player bar) | `AppShell.tsx`, `board.css` |
| Listen view | Double-click to open song — weak on touch; no single-tap open on title | `ListenView.tsx` |
| Listen header | Horizontal flex only; shuffle/play-all may crowd | `ListenView.tsx`, `board.css` |
| DnD vs scroll | `touch-action: none` on `.song-card` can fight column scroll | `board.css` |
| Dead CSS | `.mobile-import-card` unused | `board.css` |
| Single breakpoint | App uses `900px` only; no phone-specific player/titlebar rules | `board.css` |

**What works on mobile:** Kanban tabs, column snap-scroll, auto-scroll to playing column, touch DnD (150ms delay), safe-area on player bar, Voice Memos → Files import fallback.

### iOS PWA — limitations (documented in code)

| Limitation | Where | Workaround |
|------------|-------|------------|
| **Share target not supported** | `VoiceMemosShareCard.tsx` — “when iOS supports it” | Save to Files → `+ Import audio` |
| **No `beforeinstallprompt`** | `usePwaInstall.ts` | Manual Add to Home Screen; `PwaInstallBanner` hidden on iOS |
| **Background Sync unsupported** | `syncEngine.ts` ~L193 | Sync on `visibilitychange` / `focus` only |
| **Misleading install copy** | `PwaInstallBanner.tsx` mentions Share → mem• | Overpromises on iOS |
| **Missing PWA PNG icons** | `vite.config.ts`, `public/` | Broken home-screen icon |
| **First-visit share** | SW must be active to intercept `POST /app/import` | Cold start race handled by `consumeShareImportWithRetry` (Chromium only) |

Direct drag from Voice Memos app is blocked in browser — `BoardPage.tsx` `DROP_ERRORS.voice-memos-app`.

### Phase 54 — not started (next in ROADMAP)

- 54a Listen status `aria-label` on filtered empty state
- 54b Share dates as semantic `<time dateTime>`
- 54c Queue panel ✕ close `aria-describedby` kbd hint

---

## 3. Where to go next

### Immediate priorities (recommended order)

1. **Fix git/deploy hygiene**
   - Push any unpushed work; confirm GitHub Actions secrets for Vercel
   - Add real `README.md` (env, `npm run dev`, deploy, Supabase migrations)
   - Add PWA PNGs to `public/`

2. **Sync correctness** (highest product risk for Phone → Mac)
   - Enqueue sibling `sortOrder` updates in `moveSong` / `deleteSong` / `reorderSongInColumn`
   - Clear local board on `acceptBoardInvite` (mirror `switchToBoard`)
   - Consider incremental pull using `lastPulledAt`

3. **Mobile layout pass**
   - Titlebar: scroll/wrap or collapse controls at `≤900px`
   - Player bar: stacked layout on narrow screens
   - Listen: single-tap open song drawer
   - AppShell: fix banner + main height so player isn’t clipped

4. **iOS honesty + import path**
   - Update `PwaInstallBanner` copy for iOS
   - Keep Files import as primary iOS workflow

5. **Phase 54** (small a11y batch) — see `ROADMAP.md`

### Key file paths for next work

| Area | Start here |
|------|------------|
| Sync orchestration | `src/sync/syncEngine.ts` |
| Pull / push | `src/sync/pullChanges.ts`, `src/sync/pushChanges.ts` |
| Outbox | `src/db/repositories/outboxRepo.ts` |
| Board mutations | `src/db/repositories/boardRepo.ts` |
| Audio upload/download | `src/sync/audioUpload.ts`, `src/sync/audioDownload.ts` |
| Auth ↔ sync wiring | `src/hooks/useSyncAuth.ts` |
| Board roles | `src/lib/supabase/boardAccess.ts`, `src/hooks/useBoardRole.ts` |
| Invites | `src/db/repositories/inviteRepo.ts`, `src/pages/InvitePage.tsx` |
| Mobile kanban | `src/components/kanban/KanbanBoard.tsx`, `src/styles/board.css` (line ~1309) |
| Player / queue | `src/stores/playerStore.ts`, `src/components/audio/ColumnPlayerBar.tsx`, `PlayerQueueDrawer.tsx` |
| Listen view | `src/components/board/ListenView.tsx` |
| Share links | `src/components/song/SongSharePanel.tsx`, `src/db/repositories/shareRepo.ts` |
| PWA / share import | `vite.config.ts`, `src/sw/service-worker.ts`, `src/sw/share-target.ts`, `src/hooks/useShareImport.ts` |
| Roadmap | `ROADMAP.md` |

### Commands

```bash
cd ~/Projects/memo
npm install
npm run dev          # local dev
npm run build        # production build
npm test             # 17 tests
npm run deploy       # vercel --prod (manual)

# Supabase (local)
npm run supabase:start
npm run supabase:db:reset
```

### Env vars (`.env.local`)

```bash
VITE_SUPABASE_URL=https://ejwmspvewnkdcwtbofnc.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase dashboard>
```

---

## 4. Local-first Dexie ↔ Supabase data flow

### Mental model

**The UI never talks to Supabase for board edits.** It reads/writes Dexie. Cloud sync is asynchronous via an outbox (`syncQueue` table).

```
User action → repository (boardRepo, audioRepo, etc.)
           → Dexie write (immediate UI update via useLiveQuery)
           → enqueueSync(op, entityType, entityId, payload)
           → scheduleFlush() / flush()
```

### Flush cycle (`syncEngine.ts`)

When online + signed in + `setCloudSyncEnabled(true)`:

1. **`pullChanges(userId)`** — fetch remote board state, merge into Dexie (timestamp conflict rules)
2. **`cachePendingRemoteAudio({ limit: 4 })`** — download clips missing `localBlobId`
3. **`pushChanges(userId)`** — drain outbox to Supabase

Triggers: 8s interval, 4s retry when pending, `online`, `visibilitychange`, `focus`, SW `memo-sync` message (not iOS).

### Dexie tables (`src/db/database.ts`)

| Table | Purpose |
|-------|---------|
| `songs`, `columns`, `projects` | Board structure |
| `audioVersions`, `audioBlobs` | Takes + binary data (blobs local-only) |
| `songLinks`, `songComments` | External links + timestamped comments |
| `syncQueue` | Outbox — pending cloud ops |
| `syncMeta` | `boardId`, `lastPulledAt`, `lastUserId`, `projectName`, device prefs |
| `folderWatch`, `importedSources` | Voice Memos folder link (desktop) |

### Outbox priority (`outboxRepo.ts`)

`board` → `project` → `column` → `song` → links/comments → **`audio_version` last** (so metadata exists before upload).

### Pull conflict rules (`pullChanges.ts`)

- **Songs:** Remote wins if `remote.updated_at >= local.updatedAt`, except when local has `syncedAt === null` and `local.updatedAt > remote` (unsynced local wins).
- **Audio versions:** Remote wins if `remote.updated_at >= local.syncedAt`; preserves existing `localBlobId`.
- **Columns:** Merge by `slug`; `dedupeColumnsBySlug()` fixes seed+pull duplicates.
- **Comments:** Soft-delete removes local; else remote wins by timestamp.

### Push role gates (`pushChanges.ts`)

| Role | Can push board edits | Can push comments |
|------|---------------------|-------------------|
| `owner` | ✅ | ✅ |
| `editor` | ❌ | ✅ |
| `viewer` | ❌ | ✅ |

Only **owners** upload audio and mutate songs/columns/projects. Editors/viewers are comment-only for push; UI sets `readOnly` on board for non-owners (`BoardPage.tsx`).

### Audio pipeline

**Upload**

1. Import → blob in `audioBlobs`, version with `localBlobId`, `storagePath: null`
2. `enqueueSync('upload', 'audio_version', ...)`
3. Push uploads to Storage `audio/{userId}/{boardId}/{songId}/{versionId}.ext`
4. Sets `storagePath` + `syncedAt` locally

**Playback** (`resolvePlaybackUrl.ts`)

1. Prefer `localBlobId` → `URL.createObjectURL`
2. Else `storagePath` → Supabase signed URL (1h, needs network)

**Share** requires `storagePath` — local-only clips cannot be shared until uploaded.

### Auth lifecycle (`useSyncAuth.ts`)

- **Sign in:** May clear local board if different user; reset `boardId` / `lastPulledAt`; `ensureBoardForUser`; `flush()`
- **Sign out (explicit):** Wipe local board
- **Sign out (implicit/offline):** Offline grace — keep `lastUserId`, keep working locally
- **Switch board:** `clearLocalUserBoard()` + reset cursor + flush (correct isolation)
- **Accept invite:** Sets `boardId` only — **does not clear local data** (bug)

### Board ID resolution (`boardAccess.ts`)

`resolveBoardId(userId)`:

1. Cached `syncMeta.boardId`
2. Else oldest owned `boards` row
3. Else first `board_members` row

### Supabase schema

15 migrations in `supabase/migrations/` covering: profiles, boards, songs, audio_versions, sharing, comments, favourites, tags, projects, share analytics, invite email column, etc.

Types: `src/lib/supabase/database.types.ts` (regenerate with `npm run supabase:gen-types` when using local Supabase).

### Service worker

`src/sw/service-worker.ts` — precache, SPA navigation, share-target POST handler, posts `SYNC_FLUSH` to clients. Does not run sync inside SW.

---

## 5. Context for the next developer / CLI agent

- **Do not commit unless Owen asks** — he prefers explicit commit requests.
- **Update `ROADMAP.md`** after each feature batch (phases are numbered; currently at Phase 54 planned).
- **Product name:** mem• (bullet is part of branding).
- **Competitive framing:** Workspace first (Kanban, versions, favourites), share second (Samply is for presenting finished work).
- **Primary test device workflow:** Phone capture → Mac board — sync and mobile layout are the critical path.
- **Tests are thin** (17 unit tests) — no E2E; manual checklists live in `ROADMAP.md`.
- **`routes.tsx` exists but `App.tsx` is the real router** — `routes.tsx` may be stale/unused.
- **Vercel project:** `memo` (`prj_VqA0NKVsQf0EO5r1e21muZlY6bDd`) — see `.vercel/project.json` if present locally (gitignored).

---

## 6. Quick verification checklist

Before shipping changes:

1. `npm run build && npm test`
2. Sign in → add song → confirm sync badge clears
3. Phone: import via Files → appears on Mac after sync
4. Mobile: kanban tabs scroll, player bar visible, queue keyboard works
5. Share link: requires upload complete (`storagePath`)
6. iOS: confirm Files import path (not share sheet)

---

*Generated for CLI agent handoff. See `ROADMAP.md` for phased feature history (Phases 1–53 shipped in codebase; Phase 54+ planned).*
