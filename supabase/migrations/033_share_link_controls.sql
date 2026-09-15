-- 033: share links get a lifetime you choose, and one control revokes them all.
--
-- Asked for on 15 Sept after Samply went offline with a security incident.
-- Share links are the only way into songdrafts without an account, and every
-- problem found so far has lived there. Three changes:
--
-- 1. A song link's lifetime is chosen when it is made: 1, 7, 30 or 90 days,
--    or no expiry. It was always 90 days, fixed. 90 stays the default, so an
--    older client that does not send the new argument behaves as before.
-- 2. Playlist links had no expiry at all, a 12 character token (48 bits, from
--    md5 of a uuid and a clock), and no way to revoke one: there was a create
--    and a read, nothing else. They now take the same lifetime, get the same
--    128-bit token as song links, and can be revoked. None has ever been made
--    (030 found the owner check refused every owner), so nothing is reissued.
-- 3. revoke_all_share_links(): every song link, every playlist link and every
--    unused bandmate invite on the boards you own, in one statement.
--
-- Revoking is the whole of the control. Storage reads for a shared file are
-- decided by audio_storage_public_share and audio_storage_playlist_share,
-- which already refuse revoked or expired shares, so a revoked link stops
-- playing the moment this returns, not when a cache runs out.

-- ── 1. Song links: chosen lifetime ─────────────────────────────────────────
-- Dropped rather than replaced: adding a parameter makes a second overload,
-- and PostgREST refuses a call that two overloads could both answer.
drop function if exists public.create_song_share(uuid, boolean, text, uuid, text);

create or replace function public.create_song_share(
  p_song_id uuid,
  p_allow_download boolean default false,
  p_password text default null,
  p_version_id uuid default null,
  p_label text default null,
  p_expires_in_days integer default 90
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_song public.songs%rowtype;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- 0 means no expiry. Anything else is a number of days, 1 to 365.
  if p_expires_in_days is not null
     and p_expires_in_days <> 0
     and (p_expires_in_days < 1 or p_expires_in_days > 365) then
    raise exception 'Expiry must be between 1 and 365 days, or 0 for none';
  end if;

  select * into v_song from public.songs where id = p_song_id and deleted_at is null;
  if not found then
    raise exception 'Song not found';
  end if;

  if not public.user_owns_board(v_song.board_id) then
    raise exception 'Not allowed';
  end if;

  -- A pinned take must belong to this song, or the link would play (and the
  -- storage policy would release) a take from somewhere else.
  if p_version_id is not null and not exists (
    select 1 from public.audio_versions av
    where av.id = p_version_id and av.song_id = p_song_id
  ) then
    raise exception 'Not allowed';
  end if;

  insert into public.song_shares (
    song_id,
    board_id,
    created_by,
    allow_download,
    password_hash,
    version_id,
    label,
    expires_at
  )
  values (
    p_song_id,
    v_song.board_id,
    auth.uid(),
    coalesce(p_allow_download, false),
    case
      when p_password is null or length(trim(p_password)) = 0 then null
      else crypt(trim(p_password), gen_salt('bf'))
    end,
    p_version_id,
    nullif(trim(p_label), ''),
    case
      when p_expires_in_days = 0 then null
      else now() + make_interval(days => coalesce(p_expires_in_days, 90))
    end
  )
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.create_song_share(uuid, boolean, text, uuid, text, integer) from public, anon;
grant execute on function public.create_song_share(uuid, boolean, text, uuid, text, integer) to authenticated;

-- ── 2. Playlist links: real token, a lifetime, and a way to revoke ─────────
alter table public.playlist_shares
  alter column token set default encode(extensions.gen_random_bytes(16), 'hex');

drop function if exists public.create_playlist_share(uuid, uuid[], text, boolean);

create or replace function public.create_playlist_share(
  p_board_id uuid,
  p_song_ids uuid[],
  p_label text default null,
  p_allow_download boolean default false,
  p_expires_in_days integer default 90
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share_id uuid;
  v_token text;
  v_song_id uuid;
  v_version_id uuid;
  v_pos int := 0;
begin
  if not public.user_owns_board(p_board_id) then
    raise exception 'Not authorised';
  end if;

  if p_expires_in_days is not null
     and p_expires_in_days <> 0
     and (p_expires_in_days < 1 or p_expires_in_days > 365) then
    raise exception 'Expiry must be between 1 and 365 days, or 0 for none';
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

  insert into public.playlist_shares (board_id, label, allow_download, expires_at)
  values (
    p_board_id,
    p_label,
    p_allow_download,
    case
      when p_expires_in_days = 0 then null
      else now() + make_interval(days => coalesce(p_expires_in_days, 90))
    end
  )
  returning id, token into v_share_id, v_token;

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

revoke all on function public.create_playlist_share(uuid, uuid[], text, boolean, integer) from public, anon;
grant execute on function public.create_playlist_share(uuid, uuid[], text, boolean, integer) to authenticated;

create or replace function public.revoke_playlist_share(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playlist_shares ps
  set revoked_at = now()
  where ps.token = p_token
    and ps.revoked_at is null
    and public.user_owns_board(ps.board_id);
end;
$$;

revoke all on function public.revoke_playlist_share(text) from public, anon;
grant execute on function public.revoke_playlist_share(text) to authenticated;

-- ── 3. Everything at once ──────────────────────────────────────────────────
-- Counts first, so Settings can say what the button will do before you press
-- it. "Live" means someone holding the link could open it right now: not
-- revoked and not expired. Invites count while unused and unexpired.
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
        and (bi.expires_at is null or bi.expires_at > now())
        and public.user_owns_board(bi.board_id)
    )
  );
$$;

revoke all on function public.share_link_summary() from public, anon;
grant execute on function public.share_link_summary() to authenticated;

-- Revokes expired links too, not only live ones: "Renew" can bring an
-- expired song link back, and after "revoke all" nothing should be able to.
create or replace function public.revoke_all_share_links()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_songs int;
  v_playlists int;
  v_invites int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.song_shares ss
  set revoked_at = now()
  where ss.revoked_at is null
    and public.user_owns_board(ss.board_id);
  get diagnostics v_songs = row_count;

  update public.playlist_shares ps
  set revoked_at = now()
  where ps.revoked_at is null
    and public.user_owns_board(ps.board_id);
  get diagnostics v_playlists = row_count;

  update public.board_invites bi
  set revoked_at = now()
  where bi.revoked_at is null
    and public.user_owns_board(bi.board_id);
  get diagnostics v_invites = row_count;

  return json_build_object(
    'song_links', v_songs,
    'playlist_links', v_playlists,
    'invites', v_invites
  );
end;
$$;

revoke all on function public.revoke_all_share_links() from public, anon;
grant execute on function public.revoke_all_share_links() to authenticated;
