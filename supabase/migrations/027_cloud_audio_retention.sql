-- Retention, made real. 2 Sept 2026.
--
-- Two promises are printed on the live site with nothing enforcing them:
--
--  1. Privacy page: "deleted songs sit in Library for 30 days and can be
--     restored, then they go for good." Production held 21 soft-deleted songs
--     on 2 Sept, the oldest deleted on 10 June, 11 of them still carrying
--     audio. The client sweep in trashRepo.ts runs on boot and does half the
--     job: it clears the local rows and hard-deletes the audio_versions rows
--     through the outbox, but it deliberately leaves the songs row soft
--     deleted in the cloud, and it never touched storage. So the audio stayed,
--     and the rows came back down on the next pull showing "0 days".
--
--     A retention window enforced only by whether someone happens to open the
--     app cannot be stated as a fact on a privacy page. It moves server side.
--
--  2. The cancellation policy: cloud audio is removed 90 days after a
--     subscription lapses, with warnings at day 60 and day 85. Nothing existed.
--
-- What gets deleted at day 90 is the CLOUD AUDIO, not the account and not the
-- board. Song titles, notes, lyrics, tags and comments stay, so signing back
-- in shows the work with the takes missing rather than an empty board, and a
-- local copy is never touched by any of this. That is the whole point of
-- local first: our copy expiring is not the same as their copy expiring.
--
-- The sweep itself lives in the retention-sweep edge function, because
-- removing a storage object needs the Storage API. Deleting rows out of
-- storage.objects in SQL orphans the underlying file instead of freeing it,
-- which would leave us paying for bytes we told someone we had deleted. This
-- migration provides the two queries that function runs and the ledger it
-- writes to.

-- ── email_log gains the retention kinds ───────────────────────────────────
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in (
  'welcome', 'stalled_import', 'trial_ending', 'payment_failed', 'cancelled',
  'audio_expiring_60', 'audio_expiring_85', 'audio_deleted'
));

-- 025 made the log one-of-each-kind-per-address FOREVER, which is right for a
-- welcome and wrong for these three. Someone can lapse, come back, and lapse
-- again; warning them the first time and then silently deleting their audio
-- the second time is the exact failure the warnings exist to prevent.
--
-- dedupe_key carries the lapse the message is about. It stays null for the
-- five original kinds, so their behaviour is unchanged to the row.
alter table public.email_log add column if not exists dedupe_key text;

drop index if exists email_log_once_idx;
create unique index if not exists email_log_once_idx
  on public.email_log (lower(email), kind, coalesce(dedupe_key, ''));

-- ── What the sweep needs to know ──────────────────────────────────────────

-- Trash past the stated window. Returns the storage paths so the caller can
-- remove the objects BEFORE dropping the rows: doing it the other way round
-- loses the only record of which files to delete if the sweep dies halfway.
create or replace function public.retention_expired_trash(p_limit int default 500)
returns table (song_id uuid, storage_paths text[])
language sql
security definer
set search_path = public
as $$
  select s.id,
         coalesce(array_agg(av.storage_path) filter (where av.storage_path is not null), '{}')
  from public.songs s
  left join public.audio_versions av on av.song_id = s.id
  where s.deleted_at is not null
    and s.deleted_at < now() - interval '30 days'
  group by s.id
  limit p_limit;
$$;

-- Lapsed subscriptions and where each one is in the 90 day countdown.
--
-- A lapse is dated from current_period_end, the moment access actually
-- stopped, not from the cancellation. Someone who cancels in January but has
-- paid through June has not lapsed until June.
--
-- status 'past_due' is deliberately NOT a lapse. Stripe is still retrying the
-- card; deleting someone's audio because a bank declined a renewal once is
-- the worst possible reading of this policy.
create or replace function public.retention_lapsed_accounts()
returns table (
  user_id uuid,
  email text,
  display_name text,
  lapsed_on date,
  days_lapsed int,
  cloud_takes bigint,
  storage_paths text[]
)
language sql
security definer
set search_path = public
as $$
  select
    sub.user_id,
    u.email::text,
    coalesce(nullif(trim(p.display_name), ''), split_part(u.email::text, '@', 1)),
    sub.current_period_end::date,
    floor(extract(epoch from (now() - sub.current_period_end)) / 86400)::int,
    count(av.id),
    coalesce(array_agg(av.storage_path) filter (where av.storage_path is not null), '{}')
  from public.subscriptions sub
  join auth.users u on u.id = sub.user_id
  left join public.profiles p on p.id = sub.user_id
  left join public.boards b on b.user_id = sub.user_id
  left join public.songs s on s.board_id = b.id
  left join public.audio_versions av on av.song_id = s.id
  where sub.status not in ('trialing', 'active', 'past_due')
    and sub.current_period_end is not null
    and sub.current_period_end < now() - interval '55 days'
  group by sub.user_id, u.email, p.display_name, sub.current_period_end
  having count(av.id) > 0;
$$;

-- Clears the cloud copy of a lapsed account's takes, keeping every other
-- field. Called only after the storage objects are gone.
create or replace function public.retention_clear_cloud_audio(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.audio_versions av
  set storage_path = null,
      updated_at = now()
  from public.songs s
  join public.boards b on b.id = s.board_id
  where av.song_id = s.id
    and b.user_id = p_user_id
    and av.storage_path is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- None of these three are part of the browser's API surface. 019 is the
-- standing rule here: a SECURITY DEFINER function that anon can call is a
-- SECURITY DEFINER function anon will call. The sweep runs as service role,
-- which bypasses these grants entirely.
revoke all on function public.retention_expired_trash(int) from public, anon, authenticated;
revoke all on function public.retention_lapsed_accounts() from public, anon, authenticated;
revoke all on function public.retention_clear_cloud_audio(uuid) from public, anon, authenticated;
