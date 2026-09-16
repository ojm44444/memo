-- 037: a take can be a demo.
--
-- 16 Sept 2026. Listen is the finished-ish half of songdrafts: the room a
-- label or a band is played from. Samply, the tool Owen measures it against,
-- holds exactly three kinds of thing (demos, mixes, masters), and Listen only
-- knew two. A 'take' stays the private rough recording on the Songwriting
-- board; a 'demo' is one you are ready to play to people, so it lives in
-- Listen next to the mixes.

alter table public.audio_versions drop constraint if exists audio_versions_kind_known;
alter table public.audio_versions add constraint audio_versions_kind_known
  check (kind = any (array['take', 'demo', 'mix', 'master']::text[]));
