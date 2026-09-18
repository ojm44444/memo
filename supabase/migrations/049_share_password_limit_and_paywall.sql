-- 049: share password attempt limit, and no new public links on a lapsed
-- account (19 Sept 2026, security review).
--
-- Safe to apply before or after the share-audio function and the new site;
-- nothing here removes a read path. 050 does that, and must go last.
--
-- 1. Password attempts. A wrong password on a share link is recorded in
--    share_password_failures. After 20 in an hour the link refuses every
--    password, right or wrong, until the hour has passed.
--
--    The catch: an RPC that raises rolls back everything it wrote, so a
--    counter written just before "raise 'Password required'" never lands.
--    So a WRONG password (one was supplied) no longer raises. The read RPCs
--    return {"error": "Password required", "password_required": true}, which
--    the share pages now turn back into the same error. The comment RPCs
--    return null without saving anything, which also stops them being a
--    yes/no oracle for guessing. NO password at all still raises exactly as
--    before, and is not counted.
--    record_share_listener already returns silently on a wrong password, so
--    it is left as it is.
--
-- 2. get_collection_share does not count a view when the caller is the
--    service role (the share-audio function checks the link on every track).
--
-- 3. create_song_share, create_collection_share, create_playlist_share and
--    renew_song_share require paywall_satisfied(): a lapsed account keeps
--    its existing links but cannot mint or extend public ones.
--
-- Every function body below is the live definition as of 19 Sept (read from
-- production), with only the lines marked "049" changed.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.share_password_failures (
  id bigserial primary key,
  kind text not null check (kind in ('song', 'collection')),
  share_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists share_password_failures_share_idx
  on public.share_password_failures (kind, share_id, created_at);

alter table public.share_password_failures enable row level security;
revoke all on public.share_password_failures from public, anon, authenticated;
revoke all on sequence public.share_password_failures_id_seq from public, anon, authenticated;

/* 'ok' | 'missing' | 'wrong' | 'locked'. Records a failure on 'wrong'. The
   caller must not raise after 'wrong', or the record is rolled back. */
create or replace function public.share_password_check(
  p_kind text,
  p_share_id uuid,
  p_hash text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_hash is null then
    return 'ok';
  end if;

  if (
    select count(*) from public.share_password_failures f
    where f.kind = p_kind
      and f.share_id = p_share_id
      and f.created_at > now() - interval '1 hour'
  ) >= 20 then
    return 'locked';
  end if;

  if p_password is null then
    return 'missing';
  end if;

  if crypt(p_password, p_hash) = p_hash then
    return 'ok';
  end if;

  -- Old rows are no use to anyone; clear this link's as we go.
  delete from public.share_password_failures f
  where f.kind = p_kind and f.share_id = p_share_id and f.created_at < now() - interval '1 day';

  insert into public.share_password_failures (kind, share_id) values (p_kind, p_share_id);
  return 'wrong';
end;
$$;

revoke execute on function public.share_password_check(text, uuid, text, text) from public, anon, authenticated;

-- ── get_song_share_listen ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_song_share_listen(p_token text, p_password text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_share public.song_shares%rowtype;
  v_song public.songs%rowtype;
  v_version public.audio_versions%rowtype;
  v_comments json;
  v_check text; -- 049
begin
  select * into v_share
  from public.song_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Share link not found or expired';
  end if;

  -- 049: counted password check (was a plain crypt() compare that raised).
  v_check := public.share_password_check('song', v_share.id, v_share.password_hash, p_password);
  if v_check = 'locked' then
    raise exception 'Too many wrong passwords. Try again in an hour.';
  elsif v_check = 'missing' then
    raise exception 'Password required';
  elsif v_check = 'wrong' then
    return json_build_object('error', 'Password required', 'password_required', true);
  end if;

  select * into v_song
  from public.songs
  where id = v_share.song_id and board_id = v_share.board_id and deleted_at is null;
  if not found then
    raise exception 'Song not found';
  end if;

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
$function$;

-- ── get_collection_share ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_collection_share(p_token text, p_password text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_share public.playlist_shares%rowtype;
  v_tracks json;
  v_comments json;
  v_pending int;
  v_check text; -- 049
begin
  select * into v_share
  from public.playlist_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Link not found or expired';
  end if;

  -- 049: counted password check (was a plain crypt() compare that raised).
  v_check := public.share_password_check('collection', v_share.id, v_share.password_hash, p_password);
  if v_check = 'locked' then
    raise exception 'Too many wrong passwords. Try again in an hour.';
  elsif v_check = 'missing' then
    raise exception 'Password required';
  elsif v_check = 'wrong' then
    return json_build_object('error', 'Password required', 'password_required', true);
  end if;

  -- 049: the share-audio function (service role) checks the link on every
  -- track; that is not a view.
  if coalesce((select auth.role()), '') <> 'service_role' then
    update public.playlist_shares
    set view_count = view_count + 1, last_viewed_at = now()
    where id = v_share.id;
  end if;

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

  select count(*) into v_pending
  from public.playlist_share_songs pss
  join public.songs s
    on s.id = pss.song_id and s.board_id = v_share.board_id and s.deleted_at is null
  join public.audio_versions av
    on av.id = pss.version_id and av.song_id = pss.song_id
  where pss.playlist_share_id = v_share.id
    and av.storage_path is null;

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
    'pending_count', v_pending,
    'comments', v_comments
  );
end;
$function$;

-- ── add_share_listen_comment ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_share_listen_comment(p_token text, p_password text, p_timestamp_ms integer, p_body text, p_author_name text DEFAULT 'Guest'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_share public.song_shares%rowtype;
  v_id uuid;
  v_check text; -- 049
begin
  select * into v_share
  from public.song_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Share link not found or expired';
  end if;

  -- 049: counted password check; a wrong one saves nothing and says nothing.
  v_check := public.share_password_check('song', v_share.id, v_share.password_hash, p_password);
  if v_check = 'locked' then
    raise exception 'Too many wrong passwords. Try again in an hour.';
  elsif v_check = 'missing' then
    raise exception 'Password required';
  elsif v_check = 'wrong' then
    return null;
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Comment cannot be empty';
  end if;

  if length(trim(p_body)) > 2000 then
    raise exception 'Comment is too long (2,000 characters at most)';
  end if;

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
$function$;

-- ── add_collection_comment ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_collection_comment(p_token text, p_password text, p_version_id uuid, p_timestamp_ms integer, p_body text, p_author_name text DEFAULT 'Guest'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_share public.playlist_shares%rowtype;
  v_id uuid;
  v_check text; -- 049
begin
  select * into v_share
  from public.playlist_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Link not found or expired';
  end if;

  -- 049: counted password check; a wrong one saves nothing and says nothing.
  v_check := public.share_password_check('collection', v_share.id, v_share.password_hash, p_password);
  if v_check = 'locked' then
    raise exception 'Too many wrong passwords. Try again in an hour.';
  elsif v_check = 'missing' then
    raise exception 'Password required';
  elsif v_check = 'wrong' then
    return null;
  end if;

  if not exists (
    select 1 from public.playlist_share_songs pss
    where pss.playlist_share_id = v_share.id and pss.version_id = p_version_id
  ) then
    raise exception 'That track is not in this link';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Comment cannot be empty';
  end if;
  if length(trim(p_body)) > 2000 then
    raise exception 'Comment is too long (2,000 characters at most)';
  end if;

  if (
    select count(*) from public.playlist_share_comments c
    where c.playlist_share_id = v_share.id and c.created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Too many comments on this link in the last hour. Try again later.';
  end if;

  insert into public.playlist_share_comments (playlist_share_id, version_id, timestamp_ms, body, author_name)
  values (
    v_share.id,
    p_version_id,
    greatest(0, coalesce(p_timestamp_ms, 0)),
    trim(p_body),
    left(coalesce(nullif(trim(p_author_name), ''), 'Guest'), 60)
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- ── create_song_share ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_song_share(p_song_id uuid, p_allow_download boolean DEFAULT false, p_password text DEFAULT NULL::text, p_version_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_expires_in_days integer DEFAULT 90)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_song public.songs%rowtype;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- 049
  if not public.paywall_satisfied() then
    raise exception 'Your plan has ended. Renew to make new share links.';
  end if;

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

  if p_version_id is not null and not exists (
    select 1 from public.audio_versions av
    where av.id = p_version_id and av.song_id = p_song_id
  ) then
    raise exception 'Not allowed';
  end if;

  insert into public.song_shares (
    song_id, board_id, created_by, allow_download, password_hash, version_id, label, expires_at
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
$function$;

-- ── create_collection_share ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_collection_share(p_board_id uuid, p_items jsonb, p_title text DEFAULT NULL::text, p_artist text DEFAULT NULL::text, p_allow_download boolean DEFAULT false, p_expires_in_days integer DEFAULT 90, p_password text DEFAULT NULL::text, p_cover_path text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_share_id uuid;
  v_token text;
  v_count int;
  v_bad int;
begin
  if auth.uid() is null or not public.user_owns_board(p_board_id) then
    raise exception 'Not authorised';
  end if;

  -- 049
  if not public.paywall_satisfied() then
    raise exception 'Your plan has ended. Renew to make new share links.';
  end if;

  if p_expires_in_days is not null
     and p_expires_in_days <> 0
     and (p_expires_in_days < 1 or p_expires_in_days > 365) then
    raise exception 'Expiry must be between 1 and 365 days, or 0 for none';
  end if;

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
  );

  if v_bad > 0 then
    raise exception 'Some tracks have not reached the cloud yet, or are not yours';
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
$function$;

-- ── create_playlist_share ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_playlist_share(p_board_id uuid, p_song_ids uuid[], p_label text DEFAULT NULL::text, p_allow_download boolean DEFAULT false, p_expires_in_days integer DEFAULT 90)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  -- 049
  if not public.paywall_satisfied() then
    raise exception 'Your plan has ended. Renew to make new share links.';
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
$function$;

-- ── renew_song_share ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.renew_song_share(p_token text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_expires timestamptz;
begin
  -- 049
  if not public.paywall_satisfied() then
    raise exception 'Your plan has ended. Renew to make new share links.';
  end if;

  update public.song_shares ss
  set expires_at = now() + interval '90 days'
  where ss.token = p_token
    and ss.revoked_at is null
    and public.user_owns_board(ss.board_id)
  returning ss.expires_at into v_expires;

  if not found then
    raise exception 'Share link not found';
  end if;

  return v_expires;
end;
$function$;

-- CREATE OR REPLACE keeps existing grants; nothing above changes who may call what.
