-- Async song comments (co-write thread per song)

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
