-- Subscriptions.
--
-- One row per person, written ONLY by the Stripe webhook running as service
-- role. The client can read its own row and can never write one: a table the
-- browser can update is a table where anyone can grant themselves a
-- subscription, and this is the one table in the schema where that matters.
--
-- Deliberately thin. Stripe is the source of truth for billing; this is a
-- local cache of the two facts the app actually needs to answer, which are
-- "is this person paid up" and "when does that stop being true". Everything
-- else (invoices, cards, receipts, dunning) stays in Stripe where it belongs
-- and is reachable through the billing portal.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,

  stripe_customer_id text unique,
  stripe_subscription_id text unique,

  -- Stripe's own vocabulary, kept verbatim rather than mapped to something of
  -- our own. A translation layer here would be one more place for the app's
  -- idea of "active" to drift from Stripe's.
  status text not null default 'none' check (status in (
    'none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  )),

  -- 'month' or 'year'. Nullable because someone can exist here with no plan.
  plan_interval text check (plan_interval in ('month', 'year')),

  -- When access actually ends. The app checks this and nothing else, so a
  -- webhook we miss cannot silently lock someone out mid-period.
  current_period_end timestamptz,

  -- Set when they cancel but have paid through the period. They keep access.
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Read your own row. That is the entire client surface.
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

-- No insert, update or delete policy exists, on purpose. Service role bypasses
-- RLS, so the webhook writes; nobody else can, including the owner.

create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

-- Convenience for the app. SECURITY INVOKER so it runs with the caller's own
-- privileges and the RLS policy above still applies: migration 019 turned a
-- SECURITY DEFINER helper into an outage on this exact schema, and the lesson
-- was to leave the policy doing the work.
create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and status in ('trialing', 'active', 'past_due')
      and (current_period_end is null or current_period_end > now())
  );
$$;

comment on table public.subscriptions is
  'Local cache of Stripe subscription state. Written only by the webhook as service role.';
