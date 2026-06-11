-- Board sharing: members, invites, expanded RLS

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

-- Boards: owners + members can read; only owners write
drop policy if exists "boards_select_own" on public.boards;
drop policy if exists "boards_select_access" on public.boards;

create policy "boards_select_access" on public.boards
  for select using (public.user_can_access_board(id));

-- Columns
drop policy if exists "columns_via_board" on public.columns;

create policy "columns_select_access" on public.columns
  for select using (public.user_can_access_board(board_id));

create policy "columns_write_owner" on public.columns
  for all using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));

-- Songs
drop policy if exists "songs_via_board" on public.songs;

create policy "songs_select_access" on public.songs
  for select using (public.user_can_access_board(board_id));

create policy "songs_write_owner" on public.songs
  for all using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));

-- Audio versions
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

-- External links
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

-- Board members
create policy "members_select_access" on public.board_members
  for select using (public.user_can_access_board(board_id));

create policy "members_insert_owner" on public.board_members
  for insert with check (public.user_owns_board(board_id));

-- Board invites: owners manage; anyone can read valid token row via RPC only
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

-- Storage: members can read audio on shared boards
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

-- Accept invite RPC
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

-- Preview invite (board name only)
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
