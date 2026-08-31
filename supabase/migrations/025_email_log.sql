-- What we have sent, so we never send it twice.
--
-- Every lifecycle email is claimed here before it goes out. Stripe retries,
-- cron windows overlap, and a webhook can be delivered more than once; a
-- duplicate in someone's inbox is the failure they actually notice and the one
-- that costs trust. The unique index is the whole mechanism.
--
-- No RLS policy exists, so with RLS on, the browser can neither read nor write
-- it. Only the service role touches this table. That matters more than usual:
-- the rows are email addresses paired with lifecycle state, which is the exact
-- shape of data nobody should be able to enumerate.

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),

  -- Nullable, because someone can be emailed after their account is gone (the
  -- cancellation note), and losing the log then would let a retry re-send it.
  user_id uuid references auth.users (id) on delete set null,

  email text not null,
  kind text not null check (kind in (
    'welcome', 'stalled_import', 'trial_ending', 'payment_failed', 'cancelled'
  )),

  sent_at timestamptz not null default now()
);

alter table public.email_log enable row level security;

-- One of each kind, per address, ever.
--
-- Deliberately per ADDRESS rather than per user: someone who deletes their
-- account and signs up again with the same email should not be welcomed a
-- second time, and the old user_id would no longer match. If a repeatable kind
-- is ever added (a monthly digest, say), it needs its own table rather than a
-- relaxation of this one.
create unique index if not exists email_log_once_idx
  on public.email_log (lower(email), kind);

comment on table public.email_log is
  'One row per lifecycle email sent. Written only by send-lifecycle-email as service role.';
