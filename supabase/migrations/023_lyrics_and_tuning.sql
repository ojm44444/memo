-- Lyrics and tuning on a song.
--
-- BACK-FILLED 2 Sept 2026 from the live schema, not written fresh. This
-- migration was applied to production on 30 Aug (recorded there as
-- 20260830201925 023_lyrics_and_tuning) and the file never made it into the
-- repo, so migrations went 022, [gap], 024 and a replay produced a database
-- the app could not talk to: pullChanges reads remote.lyrics and remote.tuning,
-- and pushChanges writes them.
--
-- Reconstructed by reading information_schema and the column comments off
-- production, so this is what is actually there rather than what anyone
-- remembers writing. Both columns are plain nullable text with no default, no
-- constraint and no index, which matches how they are used: free text, read
-- and written whole with the rest of the song row.
--
-- Idempotent, so replaying it over a database that already has 023 is a no-op.

alter table public.songs
  add column if not exists lyrics text;

alter table public.songs
  add column if not exists tuning text;

comment on column public.songs.lyrics is
  'Plain text, whitespace significant so chords-above-lyrics charts survive.';

comment on column public.songs.tuning is
  'Free text: DADGAD, Open D, half step down. Cannot be read off a file.';
