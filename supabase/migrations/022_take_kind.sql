-- A take can now say what it is.
--
-- Everything in audio_versions today is the same thing to the schema: a file
-- attached to a song. But a voice memo recorded on a bus and a mix that came
-- back from an engineer are different objects to the person using this, with
-- different audiences. Songwriting is private and messy; the mixes are what
-- you play to the band on a sofa.
--
-- One column produces both rooms without moving any audio.
alter table public.audio_versions
  add column if not exists kind text not null default 'take';

alter table public.audio_versions
  drop constraint if exists audio_versions_kind_known;

alter table public.audio_versions
  add constraint audio_versions_kind_known
  check (kind in ('take', 'mix', 'master'));

comment on column public.audio_versions.kind is
  'take = your own recording (default). mix / master = came back from a producer or engineer, and appears in Listen.';

-- Listen asks "which songs have a mix", so index the lookup.
create index if not exists audio_versions_kind_song on public.audio_versions (kind, song_id);
