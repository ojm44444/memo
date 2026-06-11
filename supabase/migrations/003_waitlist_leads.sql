-- Early-access signups from the landing page

create table if not exists public.waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist_leads enable row level security;

create policy "waitlist_leads_insert_public"
  on public.waitlist_leads
  for insert
  with check (true);

create policy "waitlist_leads_select_none"
  on public.waitlist_leads
  for select
  using (false);
