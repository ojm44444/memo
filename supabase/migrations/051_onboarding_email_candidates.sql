-- Who should get the two "how to import" emails today.
--
--   welcome          the first 2 days after sign-up
--   stalled_import   days 2 to 6, and only while they still have no songs
--
-- Only accounts created in the last 7 days are ever listed, so switching this
-- on never mails people who joined long ago. email_log stops a repeat.
-- Callable by the service role only (the edge function).

create or replace function public.onboarding_email_candidates()
returns table (user_id uuid, email text, display_name text, kind text)
language sql
security definer
set search_path = public, auth
as $$
  with recent as (
    select u.id, u.email,
           coalesce(nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1), ''), 'there') as display_name,
           u.created_at
    from auth.users u
    where u.email is not null
      and u.created_at > now() - interval '7 days'
  ),
  counts as (
    select r.id,
           (select count(*) from songs s
              join boards b on b.id = s.board_id
             where b.user_id = r.id and s.deleted_at is null) as songs
    from recent r
  )
  select r.id, r.email, r.display_name,
         case when r.created_at > now() - interval '2 days' then 'welcome' else 'stalled_import' end as kind
  from recent r
  join counts c on c.id = r.id
  where (
      (r.created_at > now() - interval '2 days')
      or (r.created_at <= now() - interval '2 days' and r.created_at > now() - interval '6 days' and c.songs = 0)
    )
    and not exists (
      select 1 from email_log l
       where l.email = r.email
         and l.kind = case when r.created_at > now() - interval '2 days' then 'welcome' else 'stalled_import' end
    );
$$;

revoke all on function public.onboarding_email_candidates() from public, anon, authenticated;
grant execute on function public.onboarding_email_candidates() to service_role;
