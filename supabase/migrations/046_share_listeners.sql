-- 046: who listened on a share link (18 Sept 2026).
--
-- Owen, on "Links you have sent": "It says 21 opens, 13 plays. I'd like to
-- know who from and where." One row per open or play, on both kinds of link
-- (single song links and collection / playlist links), holding:
--   - an optional name the listener typed ("Your name (optional)");
--   - their browser's time zone and a rough place read from it
--     ("Europe/London" becomes "London"). No IP address is looked at, stored
--     or sent anywhere, and no third party is involved;
--   - a random id their browser made, only so the same person reopening the
--     page is not counted twice;
--   - whether it was an open or a play, and when.
--
-- Counting moves here for new clients: record_share_listener dedupes, then
-- bumps the same counters the old RPCs did. record_share_view,
-- record_share_listen and record_collection_listen are left exactly as they
-- are, so a page open in an old tab keeps working. Collection opens are still
-- counted by get_collection_share, so this function logs the row for a
-- collection open but does not touch view_count (it would count twice).
--
-- Only the link's owner reads the rows (owner policy + the restrictive
-- mfa_required / paywall_required pair from 044 / 045). Listeners never read
-- the table and nobody writes it directly: the definer RPC is the only way in.

create table if not exists public.share_listen_events (
  id uuid primary key default gen_random_uuid(),
  song_share_id uuid references public.song_shares (id) on delete cascade,
  playlist_share_id uuid references public.playlist_shares (id) on delete cascade,
  listener_id text not null,
  event text not null,
  listener_name text,
  time_zone text,
  place text,
  created_at timestamptz not null default now(),
  constraint share_listen_events_one_link check (num_nonnulls(song_share_id, playlist_share_id) = 1),
  constraint share_listen_events_event check (event in ('open', 'play')),
  constraint share_listen_events_listener_id check (listener_id ~ '^[A-Za-z0-9-]{8,64}$'),
  constraint share_listen_events_name_len check (listener_name is null or char_length(listener_name) <= 60),
  constraint share_listen_events_tz_len check (time_zone is null or char_length(time_zone) <= 64),
  constraint share_listen_events_place_len check (place is null or char_length(place) <= 64)
);

-- Owner reads (newest first per link) and the dedupe lookup.
create index if not exists share_listen_events_song_idx
  on public.share_listen_events (song_share_id, listener_id, created_at desc)
  where song_share_id is not null;
create index if not exists share_listen_events_playlist_idx
  on public.share_listen_events (playlist_share_id, listener_id, created_at desc)
  where playlist_share_id is not null;
create index if not exists share_listen_events_song_recent_idx
  on public.share_listen_events (song_share_id, created_at desc)
  where song_share_id is not null;
create index if not exists share_listen_events_playlist_recent_idx
  on public.share_listen_events (playlist_share_id, created_at desc)
  where playlist_share_id is not null;

alter table public.share_listen_events enable row level security;

drop policy if exists share_listen_events_select_owner on public.share_listen_events;
create policy share_listen_events_select_owner on public.share_listen_events
  for select to authenticated using (
    (
      song_share_id is not null
      and exists (
        select 1 from public.song_shares ss
        where ss.id = share_listen_events.song_share_id
          and public.user_owns_board(ss.board_id)
      )
    )
    or (
      playlist_share_id is not null
      and exists (
        select 1 from public.playlist_shares ps
        where ps.id = share_listen_events.playlist_share_id
          and public.user_owns_board(ps.board_id)
      )
    )
  );

-- Same gate as every other user-data table (044, 045).
drop policy if exists mfa_required on public.share_listen_events;
create policy mfa_required on public.share_listen_events as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists paywall_required on public.share_listen_events;
create policy paywall_required on public.share_listen_events as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));

-- No direct writes from anyone, and anon has no reason to read it at all.
revoke all on public.share_listen_events from anon;
revoke insert, update, delete, truncate, trigger, references
  on public.share_listen_events from authenticated;
grant select on public.share_listen_events to authenticated;

-- ── Record an open, a play, or a name ──────────────────────────────────────
-- p_kind:  'song' (a /share/<token> link) or 'collection' (/playlist/<token>).
-- p_event: 'open', 'play', or 'name' (the listener typed their name after the
--          page opened: backfills it onto their rows for this link, no count).
--
-- Dedupe: one row per listener, per link, per event type, per 10 minutes.
-- A repeat inside the window only fills in a name or time zone that arrived
-- late; it adds no row and no count. On top of that, a link takes at most 300
-- new rows an hour, so a script rotating listener ids cannot run the counts
-- up without limit. Everything that fails a check is dropped silently, the
-- same as the old counting RPCs: a listener never sees an error for this.
create or replace function public.record_share_listener(
  p_kind text,
  p_token text,
  p_event text,
  p_listener_id text,
  p_name text default null,
  p_time_zone text default null,
  p_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share_id uuid;
  v_hash text;
  v_name text;
  v_tz text;
  v_place text;
  v_recent uuid;
begin
  if coalesce(p_kind, '') not in ('song', 'collection')
     or coalesce(p_event, '') not in ('open', 'play', 'name')
     or p_token is null then
    return;
  end if;
  if p_listener_id is null or p_listener_id !~ '^[A-Za-z0-9-]{8,64}$' then
    return;
  end if;

  if p_kind = 'song' then
    select id, password_hash into v_share_id, v_hash
    from public.song_shares
    where token = p_token
      and revoked_at is null
      and (expires_at is null or expires_at > now());
  else
    select id, password_hash into v_share_id, v_hash
    from public.playlist_shares
    where token = p_token
      and revoked_at is null
      and (expires_at is null or expires_at > now());
  end if;

  if v_share_id is null then
    return;
  end if;

  -- A password link only takes rows from someone who has the password, so a
  -- stranger holding the bare URL cannot write names onto it.
  if v_hash is not null then
    if p_password is null or crypt(p_password, v_hash) <> v_hash then
      return;
    end if;
  end if;

  -- Name: trimmed, control characters removed, 60 characters at most.
  v_name := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), ''), 60);

  -- Time zone: only a well formed IANA name. The place is its last part with
  -- underscores as spaces; Etc/ and SystemV/ zones name no place.
  if p_time_zone is not null
     and char_length(p_time_zone) <= 64
     and p_time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$' then
    v_tz := p_time_zone;
    if v_tz !~* '^(etc|systemv)/' then
      v_place := left(replace(regexp_replace(v_tz, '^.*/', ''), '_', ' '), 64);
    end if;
  elsif p_time_zone in ('UTC', 'GMT') then
    v_tz := p_time_zone;
  end if;

  -- One listener at a time per link, so two quick calls cannot both miss the
  -- dedupe check and both insert.
  perform pg_advisory_xact_lock(hashtext(v_share_id::text || ':' || p_listener_id));

  if p_event = 'name' then
    if v_name is null then
      return;
    end if;
    update public.share_listen_events
    set listener_name = v_name
    where listener_id = p_listener_id
      and (
        (p_kind = 'song' and song_share_id = v_share_id)
        or (p_kind = 'collection' and playlist_share_id = v_share_id)
      )
      and listener_name is distinct from v_name;
    return;
  end if;

  select id into v_recent
  from public.share_listen_events
  where listener_id = p_listener_id
    and event = p_event
    and created_at > now() - interval '10 minutes'
    and (
      (p_kind = 'song' and song_share_id = v_share_id)
      or (p_kind = 'collection' and playlist_share_id = v_share_id)
    )
  order by created_at desc
  limit 1;

  if v_recent is not null then
    update public.share_listen_events
    set listener_name = coalesce(v_name, listener_name),
        time_zone = coalesce(v_tz, time_zone),
        place = coalesce(v_place, place)
    where id = v_recent;
    return;
  end if;

  if (
    select count(*) from public.share_listen_events
    where created_at > now() - interval '1 hour'
      and (
        (p_kind = 'song' and song_share_id = v_share_id)
        or (p_kind = 'collection' and playlist_share_id = v_share_id)
      )
  ) >= 300 then
    return;
  end if;

  insert into public.share_listen_events (
    song_share_id, playlist_share_id, listener_id, event, listener_name, time_zone, place
  )
  values (
    case when p_kind = 'song' then v_share_id end,
    case when p_kind = 'collection' then v_share_id end,
    p_listener_id,
    p_event,
    v_name,
    v_tz,
    v_place
  );

  -- The totals the owner already sees, counted once per deduped row.
  if p_kind = 'song' and p_event = 'open' then
    update public.song_shares
    set view_count = view_count + 1, last_viewed_at = now()
    where id = v_share_id;
  elsif p_kind = 'song' and p_event = 'play' then
    update public.song_shares
    set listen_count = listen_count + 1, last_listened_at = now()
    where id = v_share_id;
  elsif p_kind = 'collection' and p_event = 'play' then
    update public.playlist_shares
    set listen_count = listen_count + 1, last_listened_at = now()
    where id = v_share_id;
  end if;
  -- A collection open is already counted by get_collection_share.
end;
$$;

revoke all on function public.record_share_listener(text, text, text, text, text, text, text) from public;
grant execute on function public.record_share_listener(text, text, text, text, text, text, text) to anon, authenticated;
