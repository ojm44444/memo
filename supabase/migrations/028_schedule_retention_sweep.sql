-- Run the retention sweep once a day.
--
-- NOT APPLIED YET, and it must not be applied until two secrets exist, or the
-- job wakes up every morning to collect a 403:
--
--   1. Supabase dashboard, Edge Functions, Secrets:
--        LIFECYCLE_EMAIL_SECRET = <a long random string>
--      The retention-sweep and send-lifecycle-email functions both check it.
--      Without it retention-sweep answers 503 "Retention is not configured",
--      which is where it stands on 2 Sept.
--
--   2. The same value in Vault, so this job can send it:
--        select vault.create_secret('<the same string>', 'lifecycle_email_secret');
--
-- 03:20 UTC, chosen for being nowhere near a UK evening. This deletes audio,
-- and the hour when someone might be mid-session is the wrong hour to do it.
--
-- The sweep is idempotent: rows already purged are not found by
-- retention_expired_trash, and every email is claimed in email_log before it
-- is sent. A missed day costs a day, never a duplicate or a double delete.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('retention-sweep')
where exists (select 1 from cron.job where jobname = 'retention-sweep');

select cron.schedule(
  'retention-sweep',
  '20 3 * * *',
  $job$
  select net.http_post(
    url := 'https://ejwmspvewnkdcwtbofnc.supabase.co/functions/v1/retention-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lifecycle-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'lifecycle_email_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
