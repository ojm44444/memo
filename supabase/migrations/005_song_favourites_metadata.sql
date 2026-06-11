-- Favourites + optional song metadata (key/BPM filled manually or from file tags later)

alter table public.songs
  add column if not exists is_favourite boolean not null default false,
  add column if not exists musical_key text,
  add column if not exists bpm int;

create index if not exists songs_is_favourite_idx on public.songs (board_id, is_favourite)
  where deleted_at is null and is_favourite = true;
