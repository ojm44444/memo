-- 039: projects in Listen.
--
-- 16 Sept 2026, Owen: Listen should open on your projects, not on one random
-- list; you should be able to make several, click into one, and it should be
-- called Projects. Samply is organised exactly this way (a project is a
-- release: an EP, a single, a session), and Listen is our version of Samply.
--
-- These are NOT the Songwriting board's projects (public.projects), which
-- group rough ideas on the board. A Listen project is a release: title, artist,
-- cover. A song's stack of demos/mixes/masters belongs to at most one of them
-- (songs.listen_project_id); anything without one shows as "Not in a project".
--
-- Synced like every other entity: written to the device first, pushed through
-- the outbox, pulled by updated_at.

create table if not exists public.listen_projects (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null default 'Untitled',
  artist text,
  cover_path text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists listen_projects_board_idx on public.listen_projects (board_id, updated_at);

alter table public.listen_projects enable row level security;

create policy listen_projects_select_access on public.listen_projects
  for select using (public.user_can_access_board(board_id));

create policy listen_projects_write_owner on public.listen_projects
  for all using (public.user_owns_board(board_id))
  with check (
    public.user_owns_board(board_id)
    and (cover_path is null or split_part(cover_path, '/', 1) = (select auth.uid())::text)
  );

revoke truncate, trigger, references on public.listen_projects from anon, authenticated;
revoke all on public.listen_projects from anon;

alter table public.songs
  add column if not exists listen_project_id uuid references public.listen_projects (id) on delete set null,
  add column if not exists listen_position integer;

-- A covers path on a Listen project is released to a listener only through a
-- collection link that uses it (038), never on its own.
