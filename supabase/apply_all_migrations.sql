-- Run this once in Supabase Dashboard → SQL Editor
-- (Or use: npx supabase login && npx supabase link --project-ref ejwmspvewnkdcwtbofnc && npx supabase db push)

-- === 001_initial_schema.sql ===

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Board',
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  slug text not null,
  title text not null,
  position int not null default 0,
  unique (board_id, slug)
);

create table if not exists public.songs (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  column_slug text not null,
  title text not null,
  notes text not null default '',
  position int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.audio_versions (
  id uuid primary key,
  song_id uuid not null references public.songs (id) on delete cascade,
  storage_path text,
  file_name text not null,
  label text not null default '',
  duration_ms int not null default 0,
  position int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.external_links (
  id uuid primary key,
  song_id uuid not null references public.songs (id) on delete cascade,
  url text not null,
  label text not null default ''
);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists songs_board_column_position_idx on public.songs (board_id, column_slug, position);
create index if not exists songs_updated_at_idx on public.songs (updated_at);
create index if not exists audio_versions_song_position_idx on public.audio_versions (song_id, position);
create index if not exists audio_versions_updated_at_idx on public.audio_versions (updated_at);

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.songs enable row level security;
alter table public.audio_versions enable row level security;
alter table public.external_links enable row level security;
alter table public.waitlist enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "boards_select_own" on public.boards for select using (auth.uid() = user_id);
create policy "boards_insert_own" on public.boards for insert with check (auth.uid() = user_id);
create policy "boards_update_own" on public.boards for update using (auth.uid() = user_id);
create policy "boards_delete_own" on public.boards for delete using (auth.uid() = user_id);

create policy "columns_via_board" on public.columns for all using (
  exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
) with check (
  exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
);

create policy "songs_via_board" on public.songs for all using (
  exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
) with check (
  exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
);

create policy "audio_via_song" on public.audio_versions for all using (
  exists (
    select 1 from public.songs s
    join public.boards b on b.id = s.board_id
    where s.id = song_id and b.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.songs s
    join public.boards b on b.id = s.board_id
    where s.id = song_id and b.user_id = auth.uid()
  )
);

create policy "links_via_song" on public.external_links for all using (
  exists (
    select 1 from public.songs s
    join public.boards b on b.id = s.board_id
    where s.id = song_id and b.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.songs s
    join public.boards b on b.id = s.board_id
    where s.id = song_id and b.user_id = auth.uid()
  )
);

create policy "waitlist_insert_public" on public.waitlist for insert with check (true);
create policy "waitlist_select_none" on public.waitlist for select using (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,
  52428800,
  array['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg']
)
on conflict (id) do nothing;

create policy "audio_storage_select_own" on storage.objects for select using (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "audio_storage_insert_own" on storage.objects for insert with check (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "audio_storage_update_own" on storage.objects for update using (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "audio_storage_delete_own" on storage.objects for delete using (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_board_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.email);

  insert into public.boards (user_id, name)
  values (new.id, 'My Board')
  returning id into new_board_id;

  insert into public.columns (board_id, slug, title, position) values
    (new_board_id, 'inbox', 'Inbox', 0),
    (new_board_id, 'ideas', 'Ideas', 1),
    (new_board_id, 'demos', 'Demos', 2),
    (new_board_id, 'finished', 'Finished', 3);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- === 002_board_sharing.sql ===

create table if not exists public.board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  unique (board_id, user_id)
);

create table if not exists public.board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  expires_at timestamptz default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists board_members_user_idx on public.board_members (user_id);
create index if not exists board_invites_board_idx on public.board_invites (board_id);
create index if not exists board_invites_token_idx on public.board_invites (token);

alter table public.board_members enable row level security;
alter table public.board_invites enable row level security;

create or replace function public.user_can_access_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id and b.user_id = auth.uid()
  ) or exists (
    select 1 from public.board_members m
    where m.board_id = p_board_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.user_owns_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id and b.user_id = auth.uid()
  );
$$;

drop policy if exists "boards_select_own" on public.boards;
drop policy if exists "boards_select_access" on public.boards;

create policy "boards_select_access" on public.boards
  for select using (public.user_can_access_board(id));

drop policy if exists "columns_via_board" on public.columns;

create policy "columns_select_access" on public.columns
  for select using (public.user_can_access_board(board_id));

create policy "columns_write_owner" on public.columns
  for all using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));

drop policy if exists "songs_via_board" on public.songs;

create policy "songs_select_access" on public.songs
  for select using (public.user_can_access_board(board_id));

create policy "songs_write_owner" on public.songs
  for all using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));

drop policy if exists "audio_via_song" on public.audio_versions;

create policy "audio_select_access" on public.audio_versions
  for select using (
    exists (
      select 1 from public.songs s
      where s.id = song_id and public.user_can_access_board(s.board_id)
    )
  );

create policy "audio_write_owner" on public.audio_versions
  for all using (
    exists (
      select 1 from public.songs s
      where s.id = song_id and public.user_owns_board(s.board_id)
    )
  ) with check (
    exists (
      select 1 from public.songs s
      where s.id = song_id and public.user_owns_board(s.board_id)
    )
  );

drop policy if exists "links_via_song" on public.external_links;

create policy "links_select_access" on public.external_links
  for select using (
    exists (
      select 1 from public.songs s
      where s.id = song_id and public.user_can_access_board(s.board_id)
    )
  );

create policy "links_write_owner" on public.external_links
  for all using (
    exists (
      select 1 from public.songs s
      where s.id = song_id and public.user_owns_board(s.board_id)
    )
  ) with check (
    exists (
      select 1 from public.songs s
      where s.id = song_id and public.user_owns_board(s.board_id)
    )
  );

create policy "members_select_access" on public.board_members
  for select using (public.user_can_access_board(board_id));

create policy "members_insert_owner" on public.board_members
  for insert with check (public.user_owns_board(board_id));

create policy "invites_select_owner" on public.board_invites
  for select using (
    exists (
      select 1 from public.boards b
      where b.id = board_id and b.user_id = auth.uid()
    )
  );

create policy "invites_insert_owner" on public.board_invites
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.boards b
      where b.id = board_id and b.user_id = auth.uid()
    )
  );

create policy "invites_update_owner" on public.board_invites
  for update using (
    exists (
      select 1 from public.boards b
      where b.id = board_id and b.user_id = auth.uid()
    )
  );

create policy "audio_storage_select_member" on storage.objects
  for select using (
    bucket_id = 'audio'
    and exists (
      select 1
      from public.audio_versions av
      join public.songs s on s.id = av.song_id
      join public.board_members bm on bm.board_id = s.board_id
      where av.storage_path = name and bm.user_id = auth.uid()
    )
  );

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
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  insert into public.board_members (board_id, user_id, role)
  values (v_invite.board_id, auth.uid(), v_invite.role)
  on conflict (board_id, user_id) do update set role = excluded.role;

  return v_invite.board_id;
end;
$$;

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
    and (i.expires_at is null or i.expires_at > now());
$$;

grant execute on function public.accept_board_invite(text) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- 003_waitlist_leads.sql
create table if not exists public.waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist_leads enable row level security;

create policy "waitlist_leads_insert_public"
  on public.waitlist_leads
  for insert
  with check (true);

create policy "waitlist_leads_select_none"
  on public.waitlist_leads
  for select
  using (false);

-- 005_song_favourites_metadata.sql
alter table public.songs
  add column if not exists is_favourite boolean not null default false,
  add column if not exists musical_key text,
  add column if not exists bpm int;

create index if not exists songs_is_favourite_idx on public.songs (board_id, is_favourite)
  where deleted_at is null and is_favourite = true;

-- 006_song_comments.sql
create table if not exists public.song_comments (
  id uuid primary key,
  song_id uuid not null references public.songs (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_label text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists song_comments_song_idx on public.song_comments (song_id, created_at);
create index if not exists song_comments_board_updated_idx on public.song_comments (board_id, updated_at);

alter table public.song_comments enable row level security;

create policy "song_comments_select_access" on public.song_comments
  for select using (public.user_can_access_board(board_id));

create policy "song_comments_insert_access" on public.song_comments
  for insert with check (
    auth.uid() = user_id
    and public.user_can_access_board(board_id)
  );

create policy "song_comments_update_own" on public.song_comments
  for update using (
    auth.uid() = user_id or public.user_owns_board(board_id)
  );

create policy "song_comments_delete_own" on public.song_comments
  for delete using (
    auth.uid() = user_id or public.user_owns_board(board_id)
  );

-- 007_song_shares.sql
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
    'password_required', v_share.password_hash is not null
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
