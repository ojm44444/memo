-- Cloud-synced projects per board (shared with collaborators)

create table if not exists public.projects (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists projects_board_position_idx on public.projects (board_id, position)
  where deleted_at is null;

alter table public.songs
  add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists songs_project_id_idx on public.songs (project_id)
  where deleted_at is null;

alter table public.projects enable row level security;

create policy "projects_select_access" on public.projects
  for select using (public.user_can_access_board(board_id));

create policy "projects_write_owner" on public.projects
  for all using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));
