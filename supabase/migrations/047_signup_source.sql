-- 047: where each account came from (18 Sept 2026, Owen).
--
-- One row per account, written at sign-up, never overwritten:
--   * source / source_other: the answer to "How did you hear about
--     songdrafts?" on the Create account page. The number Owen plans off,
--     because most Reddit traffic carries no UTM.
--   * utm_*, ref, referrer, landing_path, captured_at: the first touch this
--     browser recorded (src/lib/attribution.ts).
--
-- Its own table rather than columns on profiles: profiles has an own-row
-- UPDATE policy and sits behind the paywall, and this row must be writable
-- by an unpaid account at sign-up yet never editable afterwards.
--
-- Writes: only through record_signup_source(), SECURITY DEFINER, for the
-- caller's own row. It fills empty fields only. A trigger enforces the same
-- rule for every writer (service role included): a field, once set, keeps
-- its value. There are no INSERT / UPDATE / DELETE policies, so a signed-in
-- user cannot write the table directly. Reads: own row only.

create table if not exists public.signup_sources (
  user_id uuid primary key references auth.users (id) on delete cascade,
  source text check (source in ('reddit', 'friend', 'tiktok_instagram', 'google', 'newsletter', 'other')),
  source_other text check (char_length(source_other) <= 120),
  utm_source text check (char_length(utm_source) <= 120),
  utm_medium text check (char_length(utm_medium) <= 120),
  utm_campaign text check (char_length(utm_campaign) <= 120),
  ref text check (char_length(ref) <= 120),
  referrer text check (char_length(referrer) <= 500),
  landing_path text check (char_length(landing_path) <= 300),
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.signup_sources enable row level security;

drop policy if exists signup_sources_select_own on public.signup_sources;
create policy signup_sources_select_own on public.signup_sources
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists mfa_required on public.signup_sources;
create policy mfa_required on public.signup_sources as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists paywall_required on public.signup_sources;
create policy paywall_required on public.signup_sources as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));

revoke all on public.signup_sources from anon;
revoke insert, update, delete, truncate on public.signup_sources from authenticated;
grant select on public.signup_sources to authenticated;

-- Never overwritten, whoever writes: a set field keeps its first value.
create or replace function public.signup_sources_keep_first()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id := old.user_id;
  new.source := coalesce(old.source, new.source);
  new.source_other := coalesce(old.source_other, new.source_other);
  new.utm_source := coalesce(old.utm_source, new.utm_source);
  new.utm_medium := coalesce(old.utm_medium, new.utm_medium);
  new.utm_campaign := coalesce(old.utm_campaign, new.utm_campaign);
  new.ref := coalesce(old.ref, new.ref);
  new.referrer := coalesce(old.referrer, new.referrer);
  new.landing_path := coalesce(old.landing_path, new.landing_path);
  new.captured_at := coalesce(old.captured_at, new.captured_at);
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists signup_sources_keep_first on public.signup_sources;
create trigger signup_sources_keep_first
  before update on public.signup_sources
  for each row execute function public.signup_sources_keep_first();

-- The one way in. Own row only, empty fields only, accounts up to 7 days
-- old only (so an old account can never be tagged later). Works before
-- paying: SECURITY DEFINER bypasses the paywall policy for this write alone.
-- Returns true when a row was written or filled.
create or replace function public.record_signup_source(
  p_source text default null,
  p_source_other text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_ref text default null,
  p_referrer text default null,
  p_landing_path text default null,
  p_captured_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  v_source text := nullif(lower(btrim(p_source)), '');
  v_other text := left(nullif(btrim(p_source_other), ''), 120);
begin
  if uid is null then
    return false;
  end if;
  if not public.mfa_satisfied() then
    return false;
  end if;
  if not exists (
    select 1 from auth.users u where u.id = uid and u.created_at > now() - interval '7 days'
  ) then
    return false;
  end if;
  if v_source is not null
     and v_source not in ('reddit', 'friend', 'tiktok_instagram', 'google', 'newsletter', 'other') then
    v_source := null;
  end if;
  if v_source is distinct from 'other' then
    v_other := null;
  end if;

  insert into public.signup_sources as s (
    user_id, source, source_other, utm_source, utm_medium, utm_campaign,
    ref, referrer, landing_path, captured_at
  ) values (
    uid,
    v_source,
    v_other,
    left(nullif(btrim(p_utm_source), ''), 120),
    left(nullif(btrim(p_utm_medium), ''), 120),
    left(nullif(btrim(p_utm_campaign), ''), 120),
    left(nullif(btrim(p_ref), ''), 120),
    left(nullif(btrim(p_referrer), ''), 500),
    left(nullif(btrim(p_landing_path), ''), 300),
    case when p_captured_at is null or p_captured_at > now() + interval '1 day' then null else p_captured_at end
  )
  on conflict (user_id) do update set
    source = coalesce(s.source, excluded.source),
    source_other = case
      when coalesce(s.source, excluded.source) = 'other' then coalesce(s.source_other, excluded.source_other)
      else s.source_other
    end,
    utm_source = coalesce(s.utm_source, excluded.utm_source),
    utm_medium = coalesce(s.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(s.utm_campaign, excluded.utm_campaign),
    ref = coalesce(s.ref, excluded.ref),
    referrer = coalesce(s.referrer, excluded.referrer),
    landing_path = coalesce(s.landing_path, excluded.landing_path),
    captured_at = coalesce(s.captured_at, excluded.captured_at);

  return true;
end;
$$;

revoke all on function public.record_signup_source(text, text, text, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_signup_source(text, text, text, text, text, text, text, text, timestamptz) to authenticated;
