-- Public demo share links (listen without account)

create extension if not exists pgcrypto;

create table if not exists public.song_shares (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references auth.users (id) on delete cascade,
  password_hash text,
  allow_download boolean not null default false,
  version_id uuid references public.audio_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz default (now() + interval '90 days')
);

create index if not exists song_shares_song_idx on public.song_shares (song_id);
create index if not exists song_shares_token_idx on public.song_shares (token);

alter table public.song_shares enable row level security;

create policy "song_shares_select_owner" on public.song_shares
  for select using (public.user_owns_board(board_id));

create policy "song_shares_insert_owner" on public.song_shares
  for insert with check (
    created_by = auth.uid()
    and public.user_owns_board(board_id)
  );

create policy "song_shares_update_owner" on public.song_shares
  for update using (public.user_owns_board(board_id));

-- Anon may stream audio files that back an active share link
create policy "audio_storage_public_share" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'audio'
    and exists (
      select 1
      from public.song_shares ss
      join public.audio_versions av on av.song_id = ss.song_id
      where av.storage_path = storage.objects.name
        and ss.revoked_at is null
        and (ss.expires_at is null or ss.expires_at > now())
    )
  );

create or replace function public.create_song_share(
  p_song_id uuid,
  p_allow_download boolean default false,
  p_password text default null,
  p_version_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_song public.songs%rowtype;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_song from public.songs where id = p_song_id and deleted_at is null;
  if not found then
    raise exception 'Song not found';
  end if;

  if not public.user_owns_board(v_song.board_id) then
    raise exception 'Not allowed';
  end if;

  insert into public.song_shares (
    song_id,
    board_id,
    created_by,
    allow_download,
    password_hash,
    version_id
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
    p_version_id
  )
  returning token into v_token;

  return v_token;
end;
$$;

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

  return json_build_object(
    'song_title', v_song.title,
    'version_label', v_version.label,
    'duration_ms', v_version.duration_ms,
    'storage_path', v_version.storage_path,
    'allow_download', v_share.allow_download,
    'password_required', v_share.password_hash is not null,
    'comments', '[]'::json
  );
end;
$$;

create or replace function public.revoke_song_share(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.song_shares ss
  set revoked_at = now()
  where ss.token = p_token
    and public.user_owns_board(ss.board_id);
end;
$$;

grant execute on function public.create_song_share(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.get_song_share_listen(text, text) to anon, authenticated;
grant execute on function public.revoke_song_share(text) to authenticated;
