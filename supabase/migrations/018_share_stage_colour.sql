-- 018: WITHDRAWN. This file is deliberately a no-op.
--
-- It was never applied to production, and applying it now would break the
-- share page. It is neutralised rather than deleted so the numbering stays
-- unbroken and so nobody rediscovers the idea and reapplies it. The original
-- SQL is in git at 029b5f0 if the feature is ever picked up again.
--
-- WHAT IT WAS FOR. The share page draws a song's waveform in its stage
-- colour, and without column_slug in the payload it falls back to the brand
-- accent. That is still a real and worthwhile change.
--
-- WHY IT CANNOT BE REPLAYED AS WRITTEN. It was a full rewrite of
-- get_song_share_listen, and the rewrite diverged from the function that has
-- been live since 008 in four ways, each of which is a bug against today's
-- client:
--
--   1. It reads `c.author_label` from share_listen_comments. That column does
--      not exist; the column is `author_name`. Every share page would 500.
--   2. It drops the `deleted_at is null` guard when loading the song, so a
--      song in the trash would keep serving on its old share link, against
--      what the privacy page says.
--   3. It loads only `audio_versions where id = v_share.version_id` with no
--      fallback to the song's first take. Every share created without an
--      explicit version, which is the default path, would return a null
--      storage_path instead of audio.
--   4. It returns `json_build_object('error', ...)` where the live function
--      raises. SharePage.tsx reads the thrown error, so failures would render
--      as a successful response with no audio rather than as a message.
--
-- The version live in production is the one defined in 008, unchanged, with
-- its search_path widened by 026. Replaying this repo therefore reproduces
-- production correctly with this file doing nothing, which is the point.
--
-- TO PICK THE FEATURE BACK UP: add column_slug to the payload as an ADDITIVE
-- change on top of the 008 body, the way the original comment intended, and
-- leave the four behaviours above alone.

do $$
begin
  raise notice '018_share_stage_colour is withdrawn and intentionally does nothing';
end $$;
