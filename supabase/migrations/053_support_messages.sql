-- Messages from the "Ask us" form on the landing page. The edge function
-- (contact-support) writes them with the service role; nobody else can read or
-- write. Kept so a message is never lost if the email fails, and so the form
-- can be rate limited.

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254),
  message text not null check (char_length(message) between 1 and 4000),
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;
-- No policies: only the service role (which bypasses RLS) touches it.

create index if not exists support_messages_created_idx on public.support_messages (created_at desc);
