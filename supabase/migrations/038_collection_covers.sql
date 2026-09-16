-- 038: a real cover on a collection.
--
-- 16 Sept 2026. A link to a label reads as a record when it has the record's
-- artwork on it; Samply leads with the cover and so should we. The generated
-- stage-ramp art stays as the fallback.
--
-- Covers live in the same private 'audio' bucket, under the owner's own folder
-- (uid/covers/...), so the existing insert rule (own folder, within quota)
-- already governs uploads. The bucket gains three image types for that folder's
-- sake. A listener can read a cover exactly while its collection link is live,
-- through the same definer check that releases the audio.

update storage.buckets
set allowed_mime_types = (
  select array(
    select distinct unnest(allowed_mime_types || array['image/jpeg', 'image/png', 'image/webp'])
  )
)
where id = 'audio';

alter table public.playlist_shares add column if not exists cover_path text;

drop function if exists public.create_collection_share(uuid, jsonb, text, text, boolean, integer, text);

create or replace function public.create_collection_share(
  p_board_id uuid,
  p_items jsonb,
  p_title text default null,
  p_artist text default null,
  p_allow_download boolean default false,
  p_expires_in_days integer default 90,
  p_password text default null,
  p_cover_path text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share_id uuid;
  v_token text;
  v_count int;
  v_bad int;
begin
  if auth.uid() is null or not public.user_owns_board(p_board_id) then
    raise exception 'Not authorised';
  end if;

  if p_expires_in_days is not null
     and p_expires_in_days <> 0
     and (p_expires_in_days < 1 or p_expires_in_days > 365) then
    raise exception 'Expiry must be between 1 and 365 days, or 0 for none';
  end if;

  -- A cover must be in the caller's own covers folder.
  if p_cover_path is not null and p_cover_path not like (auth.uid()::text || '/covers/%') then
    raise exception 'Not authorised';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'No tracks to share';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count = 0 then
    raise exception 'No tracks to share';
  end if;
  if v_count > 100 then
    raise exception 'A collection holds up to 100 tracks';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_items) as item
  where not exists (
    select 1
    from public.audio_versions av
    join public.songs s on s.id = av.song_id
    where av.id = (item ->> 'version_id')::uuid
      and av.song_id = (item ->> 'song_id')::uuid
      and s.board_id = p_board_id
      and s.deleted_at is null
      and av.storage_path is not null
  );

  if v_bad > 0 then
    raise exception 'Some tracks are not uploaded yet, or are not yours';
  end if;

  insert into public.playlist_shares (
    board_id, label, title, artist, allow_download, password_hash, expires_at, cover_path
  )
  values (
    p_board_id,
    nullif(trim(p_title), ''),
    left(nullif(trim(p_title), ''), 120),
    left(nullif(trim(p_artist), ''), 120),
    coalesce(p_allow_download, false),
    case
      when p_password is null or length(trim(p_password)) = 0 then null
      else crypt(trim(p_password), gen_salt('bf'))
    end,
    case
      when p_expires_in_days = 0 then null
      else now() + make_interval(days => coalesce(p_expires_in_days, 90))
    end,
    p_cover_path
  )
  returning id, token into v_share_id, v_token;

  insert into public.playlist_share_songs (playlist_share_id, song_id, version_id, position)
  select v_share_id,
         (item ->> 'song_id')::uuid,
         (item ->> 'version_id')::uuid,
         (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as t(item, ord);

  return v_token;
end;
$$;

revoke all on function public.create_collection_share(uuid, jsonb, text, text, boolean, integer, text, text) from public, anon;
grant execute on function public.create_collection_share(uuid, jsonb, text, text, boolean, integer, text, text) to authenticated;

-- Hand the cover back with the rest of the link (after the password check).
create or replace function public.get_collection_share(p_token text, p_password text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.playlist_shares%rowtype;
  v_tracks json;
  v_comments json;
begin
  select * into v_share
  from public.playlist_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Link not found or expired';
  end if;

  if v_share.password_hash is not null then
    if p_password is null or crypt(p_password, v_share.password_hash) <> v_share.password_hash then
      raise exception 'Password required';
    end if;
  end if;

  update public.playlist_shares
  set view_count = view_count + 1, last_viewed_at = now()
  where id = v_share.id;

  select coalesce(json_agg(
    json_build_object(
      'position', pss.position,
      'song_id', pss.song_id,
      'version_id', av.id,
      'title', s.title,
      'version_label', av.label,
      'kind', av.kind,
      'duration_ms', av.duration_ms,
      'storage_path', av.storage_path
    ) order by pss.position asc
  ), '[]'::json)
  into v_tracks
  from public.playlist_share_songs pss
  join public.songs s
    on s.id = pss.song_id and s.board_id = v_share.board_id and s.deleted_at is null
  join public.audio_versions av
    on av.id = pss.version_id and av.song_id = pss.song_id
  where pss.playlist_share_id = v_share.id
    and av.storage_path is not null;

  select coalesce(json_agg(
    json_build_object(
      'id', c.id,
      'version_id', c.version_id,
      'timestamp_ms', c.timestamp_ms,
      'body', c.body,
      'author_name', c.author_name,
      'created_at', c.created_at
    ) order by c.timestamp_ms asc, c.created_at asc
  ), '[]'::json)
  into v_comments
  from public.playlist_share_comments c
  where c.playlist_share_id = v_share.id;

  return json_build_object(
    'title', coalesce(v_share.title, v_share.label),
    'artist', v_share.artist,
    'allow_download', v_share.allow_download,
    'expires_at', v_share.expires_at,
    'cover_path', v_share.cover_path,
    'tracks', v_tracks,
    'comments', v_comments
  );
end;
$$;

revoke all on function public.get_collection_share(text, text) from public;
grant execute on function public.get_collection_share(text, text) to anon, authenticated;

-- Covers of live collections are released like their audio.
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
  )
  or exists (
    select 1
    from public.playlist_shares ps
    where ps.cover_path = p_name
      and ps.revoked_at is null
      and (ps.expires_at is null or ps.expires_at > now())
  );
$$;

revoke all on function public.audio_object_is_shared(text) from public;
grant execute on function public.audio_object_is_shared(text) to anon, authenticated;
