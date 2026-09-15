-- 034: close the holes an independent review found, and make share links
-- actually play for the people they are sent to.
--
-- 15 Sept 2026. A reviewer who had not written any of this read the live row
-- level security, storage rules and definer functions. Every finding below was
-- then checked against production before this was written. Exposure: none.
-- auth.users holds exactly one account (the owner's), there are no
-- board_members rows, and a scan for rows each hole could have produced
-- (invites made by a non-owner, shares whose song is on another board, takes
-- pointing at another user's folder, comments by outsiders) found zero.
--
-- WHY THE LIVE POLICIES WERE WEAK. The policies on board_invites, song_shares
-- and song_comments in production are not the ones 002, 006 and 007 created.
-- They were rewritten at some point to the `(select auth.uid())` form the
-- performance advisor recommends, and the rewrite kept only the auth.uid()
-- half of each check and dropped the ownership half. No migration in this
-- repo records it, so it was done outside the repo. Rule from here: every
-- policy change is a migration file, and a policy is never "tidied" without
-- reading what the whole expression was for.
--
-- 1. CRITICAL. board_invites INSERT only checked created_by = you. Any signed
--    in user could write an invite for ANY board (the board id is visible in
--    every shared file path) and accept it, becoming a member who can read
--    every song, lyric, note and take. Now: you must own the board.
-- 2. HIGH. song_shares INSERT/UPDATE likewise only checked created_by. A user
--    could make a share of someone else's song on their own board, with a
--    token they chose, no password and no expiry, which the real owner could
--    neither see nor revoke. Shares are now created only through
--    create_song_share (which checks ownership); the table takes no direct
--    writes. get_song_share_listen also refuses a pinned take that is not on
--    the shared song.
-- 3. HIGH. audio_versions.storage_path was free text. An owner could point a
--    take of their own at another user's file path and then share it, or
--    trash it and let the retention sweep delete the victim's file with the
--    service role. Now a take's path must sit in the writer's own folder, and
--    both retention functions only ever return paths in the board owner's
--    folder.
-- 4. HIGH, no rows yet. playlist_shares and playlist_share_songs were
--    readable by anyone, logged out included (`using (true)`): every playlist
--    token on the service, listable with the public key. Now owner only. The
--    listen page reads through a definer RPC and never needed table access.
-- 5. MEDIUM. song_comments INSERT only checked that you were signed in, with
--    user_id free, so anyone could post into any board as anyone. Now you
--    post as yourself, on a board you can access, about a song on that board.
--    The board owner can now remove any comment on their board.
-- 6. MEDIUM. Bandmate invites were reusable by anyone for 30 days. Now the
--    first account to accept an invite uses it up.
-- 7. SHARE LINKS DID NOT PLAY FOR LOGGED-OUT LISTENERS. Verified as the anon
--    role on production: with a live share, anon sees 0 song_shares rows and
--    0 matching storage objects. The storage rules for shared audio joined
--    song_shares and audio_versions, and a policy's subquery runs under the
--    CALLER's row level security, so for someone with no account those
--    tables are empty and the rule never matched. It worked for the owner
--    only because the owner can read their own folder anyway. This is the
--    likeliest explanation for the "share links never play" report that no
--    one could reproduce: everyone testing was signed in. The check now runs
--    in a SECURITY DEFINER function, which is only safe because 2 and 3 are
--    closed in the same migration; opened alone it would have released real
--    audio through forged shares.
-- 8. Low. Listener comments get length caps and a per-link hourly ceiling;
--    TRUNCATE/TRIGGER/REFERENCES (Supabase defaults, unreachable over REST)
--    are revoked from the API roles.

-- ── 1. board_invites: owner only, and single use ───────────────────────────
drop policy if exists invites_insert_owner on public.board_invites;
drop policy if exists invites_select_owner on public.board_invites;
drop policy if exists invites_update_owner on public.board_invites;

create policy invites_insert_owner on public.board_invites
  for insert with check (
    created_by = (select auth.uid()) and public.user_owns_board(board_id)
  );

create policy invites_select_owner on public.board_invites
  for select using (public.user_owns_board(board_id));

create policy invites_update_owner on public.board_invites
  for update using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));

alter table public.board_invites
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references auth.users (id) on delete set null;

create or replace function public.accept_board_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.board_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.board_invites
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  -- Opening your own invite is a no-op, not a membership.
  if public.user_owns_board(v_invite.board_id) then
    return v_invite.board_id;
  end if;

  -- One invite, one person. The same person opening it twice is fine.
  if v_invite.accepted_by is not null and v_invite.accepted_by <> auth.uid() then
    raise exception 'This invite has already been used';
  end if;

  insert into public.board_members (board_id, user_id, role)
  values (v_invite.board_id, auth.uid(), v_invite.role)
  on conflict (board_id, user_id) do update set role = excluded.role;

  update public.board_invites
  set accepted_at = coalesce(accepted_at, now()),
      accepted_by = auth.uid()
  where id = v_invite.id;

  return v_invite.board_id;
end;
$$;

revoke all on function public.accept_board_invite(text) from public, anon;
grant execute on function public.accept_board_invite(text) to authenticated;

create or replace function public.get_invite_preview(p_token text)
returns table (board_name text, board_id uuid)
language sql
security definer
set search_path = public
as $$
  select b.name, b.id
  from public.board_invites i
  join public.boards b on b.id = i.board_id
  where i.token = p_token
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now())
    and (i.accepted_by is null or i.accepted_by = auth.uid());
$$;

grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- ── 2. song_shares: no direct writes ───────────────────────────────────────
-- Every write already goes through a definer RPC (create, revoke, renew,
-- label, record view/listen, revoke all), each of which checks ownership.
drop policy if exists song_shares_insert_owner on public.song_shares;
drop policy if exists song_shares_update_owner on public.song_shares;

create or replace function public.get_song_share_listen(p_token text, p_password text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.song_shares%rowtype;
  v_song public.songs%rowtype;
  v_version public.audio_versions%rowtype;
  v_comments json;
begin
  select * into v_share
  from public.song_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Share link not found or expired';
  end if;

  if v_share.password_hash is not null then
    if p_password is null or crypt(p_password, v_share.password_hash) <> v_share.password_hash then
      raise exception 'Password required';
    end if;
  end if;

  -- The song must still be on the board the share was made on.
  select * into v_song
  from public.songs
  where id = v_share.song_id and board_id = v_share.board_id and deleted_at is null;
  if not found then
    raise exception 'Song not found';
  end if;

  -- A pinned take counts only if it is a take of THIS song.
  if v_share.version_id is not null then
    select * into v_version
    from public.audio_versions
    where id = v_share.version_id and song_id = v_share.song_id;
  end if;

  if v_version.id is null then
    select * into v_version
    from public.audio_versions
    where song_id = v_share.song_id
    order by position asc
    limit 1;
  end if;

  if v_version.storage_path is null then
    raise exception 'Audio not uploaded yet';
  end if;

  select coalesce(json_agg(
    json_build_object(
      'id', c.id,
      'timestamp_ms', c.timestamp_ms,
      'body', c.body,
      'author_name', c.author_name,
      'created_at', c.created_at
    ) order by c.timestamp_ms asc, c.created_at asc
  ), '[]'::json)
  into v_comments
  from public.share_listen_comments c
  where c.share_id = v_share.id;

  return json_build_object(
    'song_title', v_song.title,
    'version_label', v_version.label,
    'duration_ms', v_version.duration_ms,
    'storage_path', v_version.storage_path,
    'allow_download', v_share.allow_download,
    'password_required', v_share.password_hash is not null,
    'comments', v_comments
  );
end;
$$;

grant execute on function public.get_song_share_listen(text, text) to anon, authenticated;

-- ── 3. Takes can only point into your own folder ───────────────────────────
-- Paths are {ownerUid}/{boardId}/{songId}/{takeId}.ext. Only the first
-- segment is enforced: merges move a take to another song and moving a song
-- between your own boards is allowed, so later segments legitimately drift.
-- The first cannot: only a board's owner writes takes, into their own folder.
drop policy if exists audio_write_owner on public.audio_versions;

create policy audio_write_owner on public.audio_versions
  for all
  using (
    exists (
      select 1 from public.songs s
      where s.id = audio_versions.song_id and public.user_owns_board(s.board_id)
    )
  )
  with check (
    exists (
      select 1 from public.songs s
      where s.id = audio_versions.song_id and public.user_owns_board(s.board_id)
    )
    and (
      storage_path is null
      or split_part(storage_path, '/', 1) = (select auth.uid())::text
    )
  );

create or replace function public.retention_expired_trash(p_limit integer default 500)
returns table (song_id uuid, storage_paths text[])
language sql
security definer
set search_path = public
as $$
  select s.id,
         coalesce(
           array_agg(av.storage_path) filter (
             where av.storage_path is not null
               and split_part(av.storage_path, '/', 1) = b.user_id::text
           ),
           '{}'
         )
  from public.songs s
  join public.boards b on b.id = s.board_id
  left join public.audio_versions av on av.song_id = s.id
  where s.deleted_at is not null
    and s.deleted_at < now() - interval '30 days'
  group by s.id
  limit p_limit;
$$;

create or replace function public.retention_lapsed_accounts()
returns table (
  user_id uuid, email text, display_name text, lapsed_on date,
  days_lapsed integer, cloud_takes bigint, storage_paths text[]
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
    coalesce(
      array_agg(av.storage_path) filter (
        where av.storage_path is not null
          and split_part(av.storage_path, '/', 1) = sub.user_id::text
      ),
      '{}'
    )
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

revoke all on function public.retention_expired_trash(integer) from public, anon, authenticated;
revoke all on function public.retention_lapsed_accounts() from public, anon, authenticated;

-- ── 4. Playlist links: owner reads only ────────────────────────────────────
drop policy if exists playlist_shares_anon_read on public.playlist_shares;
drop policy if exists playlist_share_songs_anon_read on public.playlist_share_songs;

create policy playlist_shares_select_owner on public.playlist_shares
  for select using (public.user_owns_board(board_id));

create policy playlist_share_songs_select_owner on public.playlist_share_songs
  for select using (
    exists (
      select 1 from public.playlist_shares ps
      where ps.id = playlist_share_songs.playlist_share_id
        and public.user_owns_board(ps.board_id)
    )
  );

-- ── 5. Board comments: as yourself, where you belong ───────────────────────
drop policy if exists song_comments_insert_access on public.song_comments;
drop policy if exists song_comments_update_own on public.song_comments;
drop policy if exists song_comments_delete_own on public.song_comments;

create policy song_comments_insert_access on public.song_comments
  for insert with check (
    user_id = (select auth.uid())
    and public.user_can_access_board(board_id)
    and exists (
      select 1 from public.songs s
      where s.id = song_comments.song_id and s.board_id = song_comments.board_id
    )
  );

-- Your own comment, or any comment on a board you own (removing one is an
-- update: comments are soft deleted).
create policy song_comments_update_own on public.song_comments
  for update
  using (user_id = (select auth.uid()) or public.user_owns_board(board_id))
  with check (
    (user_id = (select auth.uid()) or public.user_owns_board(board_id))
    and public.user_can_access_board(board_id)
    and exists (
      select 1 from public.songs s
      where s.id = song_comments.song_id and s.board_id = song_comments.board_id
    )
  );

create policy song_comments_delete_own on public.song_comments
  for delete using (user_id = (select auth.uid()) or public.user_owns_board(board_id));

-- ── 6. Shared audio: decided by a definer function ─────────────────────────
-- Releases exactly the file the listen page would serve, and nothing else:
-- for a song link, the pinned take if it is still a take of that song, else
-- the song's first take (the same choice get_song_share_listen makes); for a
-- playlist link, the take each row pins. The song must be live and on the
-- share's own board, and the share unrevoked and unexpired.
create or replace function public.audio_object_is_shared(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.song_shares ss
    join public.songs s
      on s.id = ss.song_id and s.board_id = ss.board_id and s.deleted_at is null
    cross join lateral (
      select av.storage_path
      from public.audio_versions av
      where av.song_id = ss.song_id
      order by coalesce(av.id = ss.version_id, false) desc, av.position asc
      limit 1
    ) served
    where served.storage_path = p_name
      and ss.revoked_at is null
      and (ss.expires_at is null or ss.expires_at > now())
  )
  or exists (
    select 1
    from public.playlist_share_songs pss
    join public.playlist_shares ps on ps.id = pss.playlist_share_id
    join public.songs s
      on s.id = pss.song_id and s.board_id = ps.board_id and s.deleted_at is null
    join public.audio_versions av
      on av.id = pss.version_id and av.song_id = pss.song_id
    where av.storage_path = p_name
      and ps.revoked_at is null
      and (ps.expires_at is null or ps.expires_at > now())
  );
$$;

-- A function used by a storage policy needs EXECUTE for the role doing the
-- reading (see 029). Listeners have no account, so that includes anon.
revoke all on function public.audio_object_is_shared(text) from public;
grant execute on function public.audio_object_is_shared(text) to anon, authenticated;

drop policy if exists audio_storage_public_share on storage.objects;
drop policy if exists audio_storage_playlist_share on storage.objects;

create policy audio_storage_shared_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'audio' and public.audio_object_is_shared(name));

-- Revoke-all and the Settings count ignore invites someone has already used.
create or replace function public.share_link_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'song_links', (
      select count(*) from public.song_shares ss
      where ss.revoked_at is null
        and (ss.expires_at is null or ss.expires_at > now())
        and public.user_owns_board(ss.board_id)
    ),
    'playlist_links', (
      select count(*) from public.playlist_shares ps
      where ps.revoked_at is null
        and (ps.expires_at is null or ps.expires_at > now())
        and public.user_owns_board(ps.board_id)
    ),
    'invites', (
      select count(*) from public.board_invites bi
      where bi.revoked_at is null
        and bi.accepted_at is null
        and (bi.expires_at is null or bi.expires_at > now())
        and public.user_owns_board(bi.board_id)
    )
  );
$$;

-- ── 7. Listener comments: bounded ──────────────────────────────────────────
create or replace function public.add_share_listen_comment(
  p_token text,
  p_password text,
  p_timestamp_ms integer,
  p_body text,
  p_author_name text default 'Guest'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.song_shares%rowtype;
  v_id uuid;
begin
  select * into v_share
  from public.song_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Share link not found or expired';
  end if;

  if v_share.password_hash is not null then
    if p_password is null or crypt(p_password, v_share.password_hash) <> v_share.password_hash then
      raise exception 'Password required';
    end if;
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Comment cannot be empty';
  end if;

  if length(trim(p_body)) > 2000 then
    raise exception 'Comment is too long (2,000 characters at most)';
  end if;

  -- A person leaving notes on a song writes a handful. Sixty in an hour on
  -- one link is a script, and every one of them emails the owner.
  if (
    select count(*) from public.share_listen_comments c
    where c.share_id = v_share.id and c.created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Too many comments on this link in the last hour. Try again later.';
  end if;

  insert into public.share_listen_comments (share_id, timestamp_ms, body, author_name)
  values (
    v_share.id,
    greatest(0, coalesce(p_timestamp_ms, 0)),
    trim(p_body),
    left(coalesce(nullif(trim(p_author_name), ''), 'Guest'), 60)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_share_listen_comment(text, text, integer, text, text) to anon, authenticated;

-- ── 8. API roles never need these ──────────────────────────────────────────
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
