-- 030: Playlist shares have never worked for anyone. Fix the owner test.
--
-- create_playlist_share decided "does the caller own this board" by looking
-- for a board_members row with role 'owner'. But ownership everywhere else in
-- this schema is boards.user_id (see user_owns_board, used by every song
-- share function), and board_members only ever holds INVITED bandmates. No
-- owner has an 'owner' row there, so the function refused every owner, and
-- production has 0 playlist shares. Found on 14 Sept while testing 029's new
-- song check as Owen: the foreign song was refused, and then so was his own.
-- It was the only function or policy testing ownership this way.
--
-- Same body as 029 otherwise, defaults kept (CREATE OR REPLACE cannot drop
-- them and the client calls it without the last two arguments).

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
  /* Ownership is boards.user_id, the same test user_owns_board uses for
     every share function. The old check looked for a board_members row with
     role 'owner', but board_members only ever holds invited bandmates: no
     owner has such a row, so this refused every owner and no playlist share
     has ever been created. Found while testing the check below. */
  if not public.user_owns_board(p_board_id) then
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
