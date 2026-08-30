-- First-party product analytics, owner-only.
--
-- Vercel Analytics is anonymous and aggregate, so it cannot answer the four
-- questions the business plan actually hangs on:
--   1. does anyone import more than one memo
--   2. does anyone come back on day two
--   3. does anyone move a card right   <- the product itself
--   4. does anyone name a song
-- Those need per-account events, which is what this table is.
--
-- PRIVACY IS A DESIGN CONSTRAINT, NOT A NOTE. The landing page says nobody
-- browses your songs. So this records event NAMES and NUMBERS only: never a
-- title, never a filename, never a note, never audio. The admin view is built
-- on counts, and there is deliberately no way to reach content through it.

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- Numeric facts only (counts, durations, positions). No free text.
  value numeric,
  -- A coarse bucket, e.g. which column a song moved to. Constrained below.
  bucket text,
  created_at timestamptz not null default now()
);

-- Keep the surface honest: only known event names, only known buckets.
alter table public.product_events
  add constraint product_events_name_known check (name in (
    'session_start',
    'import_completed',
    'song_moved',
    'song_renamed',
    'playback_started',
    'share_created',
    'song_merged',
    'take_added'
  ));

alter table public.product_events
  add constraint product_events_bucket_short check (bucket is null or length(bucket) <= 40);

create index if not exists product_events_user_time on public.product_events (user_id, created_at desc);
create index if not exists product_events_name_time on public.product_events (name, created_at desc);

alter table public.product_events enable row level security;

-- Anyone signed in may record their OWN events. Nobody may update or delete:
-- an analytics log you can rewrite is not evidence.
create policy "product_events_insert_own" on public.product_events
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Only the owner reads. Hard-coded to Owen's account rather than a role,
-- because there is exactly one owner and a role table is a bigger surface
-- than the thing it protects.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = '1d1a6686-3a5d-4038-9573-25be1cba369a'::uuid;
$$;

comment on function public.is_owner is
  'True only for the songdrafts owner account. Gates the admin analytics view.';

create policy "product_events_select_owner" on public.product_events
  for select to authenticated
  using (public.is_owner());

grant execute on function public.is_owner() to authenticated;

-- The admin summary. A FUNCTION rather than a view so the owner check runs
-- server-side and cannot be bypassed by a crafted client query.
create or replace function public.owner_product_summary()
returns table (
  metric text,
  value numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorised';
  end if;

  return query
  select 'accounts'::text, count(*)::numeric from auth.users
  union all
  select 'accounts_that_imported', count(distinct user_id)::numeric
    from public.product_events where name = 'import_completed'
  union all
  -- Activation 1: more than one import event, i.e. came back to add more.
  select 'imported_more_than_once', count(*)::numeric from (
    select user_id from public.product_events
    where name = 'import_completed' group by user_id having count(*) > 1
  ) t
  union all
  -- Activation 2: any activity on a later calendar day than their first.
  select 'returned_another_day', count(*)::numeric from (
    select user_id from public.product_events
    group by user_id having count(distinct date_trunc('day', created_at)) > 1
  ) t
  union all
  -- Activation 3: the product itself.
  select 'moved_a_card', count(distinct user_id)::numeric
    from public.product_events where name = 'song_moved'
  union all
  -- Activation 4: naming is the cheapest proxy for caring.
  select 'named_a_song', count(distinct user_id)::numeric
    from public.product_events where name = 'song_renamed'
  union all
  select 'songs_total', count(*)::numeric from public.songs where deleted_at is null
  union all
  select 'storage_bytes', coalesce(sum((metadata->>'size')::bigint), 0)::numeric
    from storage.objects where bucket_id = 'audio'
  union all
  select 'events_7d', count(*)::numeric from public.product_events
    where created_at > now() - interval '7 days';
end;
$$;

revoke all on function public.owner_product_summary() from public, anon;
grant execute on function public.owner_product_summary() to authenticated;
