-- 035: the new prices, and 100 founding places that the server counts.
--
-- Decided 14-15 Sept (Owen, via the consultant):
--   $79 a year, $12 a month. No $1 week, no trial.
--   The first 100 annual subscribers pay $49 a year, for as long as their
--   subscription stays active. Cancel or lapse and you rejoin at the current
--   price; the place is gone. Said at the point of sale, not only in terms.
--   A refunded founder's place goes back into the 100: the count means
--   paying founders.
--   30 day refund on annual, from a button in Settings.
--
-- THE CAP IS ENFORCED HERE, NOT IN THE BROWSER. A place is held when checkout
-- starts (Stripe's minimum session life is 30 minutes, so the hold is a little
-- longer), made active when payment completes, and released when the checkout
-- expires, the subscription ends, or it is refunded. Claiming takes a
-- transaction-level advisory lock, so the 100th and 101st person pressing the
-- button at the same moment cannot both get one.
--
-- One founding place per person, ever. Someone who has had an active place
-- and left does not get another, even if places are free again: that is what
-- "the place is gone" means, and it stops pay, refund, repeat.

alter table public.subscriptions
  add column if not exists plan text check (plan in ('founding_year', 'year', 'month')),
  add column if not exists first_paid_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists retained_reported_at timestamptz;

create table if not exists public.founding_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('held', 'active', 'released')),
  held_until timestamptz,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  released_at timestamptz,
  release_reason text check (release_reason in ('checkout_expired', 'ended', 'refunded'))
);

-- At most one place per person that is not released.
create unique index if not exists founding_places_one_live_per_user
  on public.founding_places (user_id) where status <> 'released';

alter table public.founding_places enable row level security;

-- You can see your own place. Nobody writes from the browser: the checkout
-- and webhook functions do, as service role.
create policy founding_places_select_own on public.founding_places
  for select using (user_id = (select auth.uid()));

revoke all on public.founding_places from anon;
revoke insert, update, delete, truncate, trigger, references on public.founding_places from authenticated;

create or replace function public.founding_cap()
returns integer
language sql
immutable
as $$ select 100 $$;

-- Places taken right now: paid, or held by a checkout still open.
create or replace function public.founding_places_taken()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.founding_places
  where status = 'active'
     or (status = 'held' and held_until > now());
$$;

revoke all on function public.founding_places_taken() from public, anon, authenticated;

-- The number the pricing section shows. Public, and only ever a count.
create or replace function public.founding_places_left()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(public.founding_cap() - public.founding_places_taken(), 0);
$$;

revoke all on function public.founding_places_left() from public;
grant execute on function public.founding_places_left() to anon, authenticated;

-- Can this person still have a founding place? False once they have ever
-- had an active one.
create or replace function public.founding_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.founding_places
    where user_id = p_user_id and activated_at is not null
  );
$$;

revoke all on function public.founding_eligible(uuid) from public, anon, authenticated;

-- The signed-in person's own answer, for the Plan section.
create or replace function public.my_founding_eligible()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.founding_eligible(auth.uid());
$$;

revoke all on function public.my_founding_eligible() from public, anon;
grant execute on function public.my_founding_eligible() to authenticated;

/**
 * Hold a place for a checkout. Service role only (the checkout function).
 * Returns the place id, or null when all 100 are taken. Raises
 * 'founding_not_eligible' for someone who has already had one.
 */
create or replace function public.claim_founding_place(p_user_id uuid, p_hold_minutes integer default 40)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('songdrafts.founding_places'));

  -- Tidy holds whose checkout has gone, so they stop counting.
  update public.founding_places
  set status = 'released', released_at = now(), release_reason = 'checkout_expired'
  where status = 'held' and held_until <= now();

  if not public.founding_eligible(p_user_id) then
    raise exception 'founding_not_eligible';
  end if;

  -- The same person pressing the button twice keeps one hold.
  select id into v_id
  from public.founding_places
  where user_id = p_user_id and status = 'held';

  if v_id is not null then
    update public.founding_places
    set held_until = now() + make_interval(mins => p_hold_minutes)
    where id = v_id;
    return v_id;
  end if;

  if public.founding_places_taken() >= public.founding_cap() then
    return null;
  end if;

  insert into public.founding_places (user_id, status, held_until)
  values (p_user_id, 'held', now() + make_interval(mins => p_hold_minutes))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.claim_founding_place(uuid, integer) from public, anon, authenticated;
