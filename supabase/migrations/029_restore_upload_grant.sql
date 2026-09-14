-- 029: Every audio upload has failed since 26 Aug. Restore the grant, and
-- close a playlist share hole found in the same audit.
--
-- 1. THE UPLOAD OUTAGE.
--
-- 017_storage_quota put account_within_storage_quota(auth.uid()) into the
-- storage INSERT policy audio_storage_insert_own, then revoked EXECUTE on the
-- function "from public, anon" on the reasoning that it was internal, used only
-- by the policy. That reasoning is wrong. Postgres evaluates a policy with the
-- privileges of the role running the query, and calling a function needs
-- EXECUTE on it whatever the function's own SECURITY setting: DEFINER only
-- changes what runs INSIDE the body. The uploader is `authenticated`, which
-- had EXECUTE only by inheritance from PUBLIC, so the revoke took it away.
--
-- Result, from 26 Aug 07:33 UTC (when 017 was applied) onwards: every upload
-- rejected with "permission denied for function account_within_storage_quota".
-- Owen saw it on 8 Sept as the red badge that replaced "Uploading…". The last
-- file to reach the bucket is dated 24 June. A failed upload never registers
-- in the cloud, so nothing here counts them: anything recorded since 26 Aug
-- has lived only in the browser that imported it, retrying in the outbox.
-- Restoring the grant lets those retries succeed.
--
-- 2. HARDENING, so the grant does not become a probe.
--
-- With EXECUTE granted, any signed-in user could call this over PostgREST with
-- someone else's id and learn whether that account is near its limit. The
-- function now answers only about the caller. The policy always passes
-- auth.uid(), so for its real use nothing changes; auth.uid() reads the request
-- claim, which is available inside a DEFINER function.
--
-- account_storage_bytes stays locked: it is only called from inside this
-- DEFINER function, which runs with the owner's rights.

create or replace function public.account_within_storage_quota(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id is not null
     and p_user_id = auth.uid()
     and public.account_storage_bytes(p_user_id) < (10::bigint * 1024 * 1024 * 1024)
$$;

revoke all on function public.account_within_storage_quota(uuid) from public, anon;
grant execute on function public.account_within_storage_quota(uuid) to authenticated;

-- 3. PLAYLIST SHARES COULD INCLUDE SOMEONE ELSE'S SONG.
--
-- create_playlist_share checked that the caller owns p_board_id but never that
-- the songs in p_song_ids belong to that board. The storage policy
-- audio_storage_playlist_share grants read access to any object whose version
-- is in a live playlist share. And a song's id is not secret from anyone who
-- has received a share link: it is inside the storage_path the share page
-- returns. So a recipient could put that song into a playlist on their OWN
-- board and keep hearing it after the owner revoked the link, and get past a
-- share password the same way.
--
-- Now every song must belong to the board, and must not be in the trash.
-- (The owner test here is corrected in 030.)

-- Defaults kept exactly as they were: CREATE OR REPLACE cannot drop them, and
-- the client relies on calling it without the last two arguments.
create or replace function public.create_playlist_share(
  p_board_id uuid,
  p_song_ids uuid[],
  p_label text default null,
  p_allow_download boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share_id uuid;
  v_token text;
  v_song_id uuid;
  v_version_id uuid;
  v_pos int := 0;
begin
  if not exists (
    select 1 from public.board_members
    where board_id = p_board_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Not authorised';
  end if;

  if p_song_ids is null or cardinality(p_song_ids) = 0 then
    raise exception 'No songs to share';
  end if;

  if exists (
    select 1
    from unnest(p_song_ids) as requested(song_id)
    where not exists (
      select 1 from public.songs s
      where s.id = requested.song_id
        and s.board_id = p_board_id
        and s.deleted_at is null
    )
  ) then
    raise exception 'Not authorised';
  end if;

  v_token := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12);

  insert into public.playlist_shares (token, board_id, label, allow_download)
  values (v_token, p_board_id, p_label, p_allow_download)
  returning id into v_share_id;

  foreach v_song_id in array p_song_ids loop
    select id into v_version_id
    from public.audio_versions
    where song_id = v_song_id
    order by position asc
    limit 1;

    insert into public.playlist_share_songs (playlist_share_id, song_id, version_id, position)
    values (v_share_id, v_song_id, v_version_id, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_token;
end;
$$;

revoke all on function public.create_playlist_share(uuid, uuid[], text, boolean) from public, anon;
grant execute on function public.create_playlist_share(uuid, uuid[], text, boolean) to authenticated;
