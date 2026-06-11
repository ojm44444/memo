-- Timestamped feedback on public share listen pages

create table if not exists public.share_listen_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.song_shares (id) on delete cascade,
  timestamp_ms integer not null default 0 check (timestamp_ms >= 0),
  body text not null check (char_length(trim(body)) > 0),
  author_name text not null default 'Guest' check (char_length(trim(author_name)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists share_listen_comments_share_idx
  on public.share_listen_comments (share_id, timestamp_ms);

alter table public.share_listen_comments enable row level security;

-- Owners can read comments on their shares (for future in-app view)
create policy "share_listen_comments_select_owner" on public.share_listen_comments
  for select using (
    exists (
      select 1
      from public.song_shares ss
      where ss.id = share_id
        and public.user_owns_board(ss.board_id)
    )
  );

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
set search_path = public
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

  insert into public.share_listen_comments (
    share_id,
    timestamp_ms,
    body,
    author_name
  )
  values (
    v_share.id,
    greatest(0, coalesce(p_timestamp_ms, 0)),
    trim(p_body),
    coalesce(nullif(trim(p_author_name), ''), 'Guest')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_share_listen_comment(text, text, integer, text, text) to anon, authenticated;

-- Include comments in share listen payload
create or replace function public.get_song_share_listen(
  p_token text,
  p_password text default null
)
returns json
language plpgsql
security definer
set search_path = public
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

  select * into v_song from public.songs where id = v_share.song_id and deleted_at is null;
  if not found then
    raise exception 'Song not found';
  end if;

  if v_share.version_id is not null then
    select * into v_version from public.audio_versions where id = v_share.version_id;
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
