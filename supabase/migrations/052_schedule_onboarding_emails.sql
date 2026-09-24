-- NOT APPLIED. Needs the same two secrets as 028 (LIFECYCLE_EMAIL_SECRET in
-- Edge Function secrets, and the same value in Vault as lifecycle_email_secret),
-- and RESEND_API_KEY. Runs every morning at 09:10 UTC.

select cron.unschedule('onboarding-emails')
where exists (select 1 from cron.job where jobname = 'onboarding-emails');

select cron.schedule(
  'onboarding-emails',
  '10 9 * * *',
  $job$
  select net.http_post(
    url := 'https://ejwmspvewnkdcwtbofnc.supabase.co/functions/v1/onboarding-emails',
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
