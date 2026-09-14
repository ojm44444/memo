-- 032: the cloud refuses files the app happily imports. Stop that.
--
-- Found 14 Sept while reconciling a date gap the consultant spotted: 029 says
-- uploads broke on 26 Aug, yet the newest file in the bucket is from 24 June.
-- Part of the answer is a second, older bug. The audio bucket accepted eight
-- MIME types up to 50 MB, while the app imports far more:
--
--   AIFF (.aif, .aiff)          sent as audio/aiff or audio/x-aiff  -> refused
--   Core Audio (.caf)           sent as audio/x-caf                 -> refused
--   iPhone video (.MOV, .mp4)   sent as video/quicktime, video/mp4  -> refused
--   FLAC, AMR, Opus             audio/flac, audio/amr, audio/opus   -> refused
--   WAV reported as x-wav/wave  audio/x-wav, audio/wave             -> refused
--   anything over 50 MB, which is most full-length WAV bounces      -> refused
--
-- Every one of those failed its upload, and after five attempts the outbox
-- deleted the job for good, silently. So since the app first shipped, a take
-- in any of those formats has lived only on the device that imported it. The
-- client now also sends one canonical type per format (see cloudAudio.ts), and
-- a recovery pass re-queues everything local-only on the next app start.
--
-- 200 MB covers a full song as a 24-bit/96k stereo WAV with room to spare, and
-- the 10 GB per-account quota from 017 still bounds the total. NOTE: the
-- project-wide "upload file size limit" in Supabase's Storage settings caps
-- this; if it is still at its 50 MB default, the larger files are refused
-- there instead, and the client records them as blocked rather than retrying.

update storage.buckets
set file_size_limit = 209715200,
    allowed_mime_types = array[
      'audio/mp4', 'audio/m4a', 'audio/x-m4a',
      'audio/mpeg', 'audio/mp3',
      'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
      'audio/aac',
      'audio/aiff', 'audio/x-aiff',
      'audio/x-caf',
      'audio/flac', 'audio/x-flac',
      'audio/ogg', 'audio/opus', 'audio/webm',
      'audio/amr', 'audio/3gpp',
      'video/quicktime', 'video/mp4'
    ]
where id = 'audio';

-- The recovery reports what it found, so "how close did we come" is a number.
alter table public.product_events drop constraint if exists product_events_name_known;
alter table public.product_events add constraint product_events_name_known check (name = any (array[
  'session_start', 'import_completed', 'song_moved', 'song_renamed', 'playback_started',
  'share_created', 'song_merged', 'take_added',
  'upload_backfill', 'upload_blocked'
]::text[]));
