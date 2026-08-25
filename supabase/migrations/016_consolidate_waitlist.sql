-- Consolidate the two waitlist tables into one.
--
-- Two existed: public.waitlist (migration 001) and public.waitlist_leads
-- (migration 003). Identical schemas. The landing page wrote to `waitlist`
-- while `waitlist_leads` held the only real row, so signups were split across
-- a table nobody read and a table nothing wrote to.
--
-- Canonical: waitlist_leads. It is the purpose-built one ("early-access
-- signups from the landing page"), it holds the existing data, and its name
-- says what it is.

-- Carry over anything in the old table. on conflict do nothing because both
-- have a unique constraint on email and the same address may exist in both.
insert into public.waitlist_leads (email, created_at)
select email, created_at from public.waitlist
on conflict (email) do nothing;

drop table if exists public.waitlist;

-- Remove probe rows written while verifying the fix on 2026-08-25. All used
-- the reserved .test TLD so they cannot collide with a real signup.
delete from public.waitlist_leads where email like '%@songdrafts.test';

-- Guard against the original bug returning. The landing page inserts as anon
-- and must never need UPDATE or SELECT:
--   insert  -> allowed (anyone can join the list)
--   select  -> denied  (the list is not public)
--   update  -> no policy, so an upsert conflict fails loudly rather than
--              silently doing nothing
-- These are re-asserted idempotently in case 003 was applied before them.
drop policy if exists "waitlist_leads_insert_public" on public.waitlist_leads;
create policy "waitlist_leads_insert_public"
  on public.waitlist_leads
  for insert
  with check (true);

drop policy if exists "waitlist_leads_select_none" on public.waitlist_leads;
create policy "waitlist_leads_select_none"
  on public.waitlist_leads
  for select
  using (false);
