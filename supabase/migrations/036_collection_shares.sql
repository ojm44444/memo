-- 036: collections. One link to a set of mixes, the way a label expects it.
--
-- 16 Sept 2026. Owen needs to send mixes to a label, and Samply (the tool he
-- used for exactly this) is offline after a security incident in which an
-- attacker opened "anyone with the link" links. The share side of songdrafts
-- was one song per link, or a playlist link that always played each song's
-- FIRST take, which for a mix is the wrong file.
--
-- A collection is the existing playlist_shares row, grown up:
--   - a title and an artist line, so the page reads like a record, not a list;
--   - each row pins an exact take (a mix, a master, any version), and one song
--     can appear more than once so earlier versions can sit under the top one;
--   - an optional password, checked before anything about the tracks is
--     returned, the same as song links;
--   - timestamped comments per track, from listeners with no account;
--   - open and play counts for the owner.
--
-- Everything that matters for security is inherited from 033/034: 128-bit
-- tokens, expiry, revoke and revoke-all, owner-only table reads, and storage
-- that releases exactly the pinned takes of a live link and nothing else
-- (audio_object_is_shared). Nothing here widens that.

alter table public.playlist_shares
  add column if not exists title text,
  add column if not exists artist text,
  add column if not exists password_hash text,
  add column if not exists listen_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_listened_at timestamptz;

create table if not exists public.playlist_share_comments (
  id uuid primary key default gen_random_uuid(),
  playlist_share_id uuid not null references public.playlist_shares (id) on delete cascade,
  version_id uuid not null,
  timestamp_ms integer not null default 0,
  body text not null,
  author_name text not null default 'Guest',
  created_at timestamptz not null default now()
);

create index if not exists playlist_share_comments_share_idx
  on public.playlist_share_comments (playlist_share_id, created_at);

alter table public.playlist_share_comments enable row level security;

-- The owner reads comments left on their collections. Listeners never read
-- the table: the listen RPC hands back the comments for the one link.
create policy playlist_share_comments_select_owner on public.playlist_share_comments
  for select using (
    exists (
      select 1 from public.playlist_shares ps
      where ps.id = playlist_share_comments.playlist_share_id
        and public.user_owns_board(ps.board_id)
    )
  );

revoke insert, update, delete, truncate, trigger, references
  on public.playlist_share_comments from anon, authenticated;

-- ── Create ─────────────────────────────────────────────────────────────────
-- p_items: [{"song_id": "...", "version_id": "..."}, ...] in the order they
-- should play. Every take must be a take of that song, the song must be live
-- and on the caller's board, and the take must be in the cloud.
create or replace function public.create_collection_share(
  p_board_id uuid,
  p_items jsonb,
  p_title text default null,
  p_artist text default null,
  p_allow_download boolean default false,
  p_expires_in_days integer default 90,
  p_password text default null
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
    board_id, label, title, artist, allow_download, password_hash, expires_at
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
    end
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

revoke all on function public.create_collection_share(uuid, jsonb, text, text, boolean, integer, text) from public, anon;
grant execute on function public.create_collection_share(uuid, jsonb, text, text, boolean, integer, text) to authenticated;

-- ── Listen ─────────────────────────────────────────────────────────────────
-- Works for every playlist link, old ones included. The password is checked
-- before a single track, title or path is returned.
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
    'tracks', v_tracks,
    'comments', v_comments
  );
end;
$$;

revoke all on function public.get_collection_share(text, text) from public;
grant execute on function public.get_collection_share(text, text) to anon, authenticated;

-- ── Count a play ───────────────────────────────────────────────────────────
create or replace function public.record_collection_listen(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.playlist_shares
  set listen_count = listen_count + 1, last_listened_at = now()
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());
$$;

revoke all on function public.record_collection_listen(text) from public;
grant execute on function public.record_collection_listen(text) to anon, authenticated;

-- ── Comment on a track ─────────────────────────────────────────────────────
create or replace function public.add_collection_comment(
  p_token text,
  p_password text,
  p_version_id uuid,
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
  v_share public.playlist_shares%rowtype;
  v_id uuid;
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
$$;

revoke all on function public.add_collection_comment(text, text, uuid, integer, text, text) from public;
grant execute on function public.add_collection_comment(text, text, uuid, integer, text, text) to anon, authenticated;
