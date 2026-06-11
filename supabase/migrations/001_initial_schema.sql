-- Memo (Stemo) initial schema

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
