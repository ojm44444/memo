-- 031: let email_log record listener-feedback notifications.
--
-- notify-share-feedback now claims a row here per comment before it sends,
-- keyed "<share id>:<comment id>", so each real comment produces exactly one
-- email however many times the function is called, and a per-share hourly cap
-- can be counted from the same rows. The kind check has to allow it.

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind = any (array[
  'welcome', 'stalled_import', 'trial_ending', 'payment_failed', 'cancelled',
  'audio_expiring_60', 'audio_expiring_85', 'audio_deleted',
  'share_feedback'
]::text[]));
