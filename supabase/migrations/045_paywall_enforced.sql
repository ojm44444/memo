-- 045: the paywall, enforced by the database (18 Sept 2026).
--
-- PlanGate blocks the whole app in React until an account is comped, predates
-- PAYWALL_FROM, or holds a subscription that grants access. Until now that was
-- the ONLY place it was checked: nothing in Postgres stopped a signed-in,
-- unpaid account from reading or writing its data directly. Restrictive
-- policies sit on top of every existing rule, so nothing becomes more open.
-- Mirrors src/lib/billing.ts (PAYWALL_FROM, hasAccess) exactly.
--
-- Verified on production after applying: Owen's account passes and reads all
-- its songs; a signed-in account with no qualifying status reads none.

create or replace function public.paywall_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce((select (raw_app_meta_data ->> 'comped')::boolean from auth.users where id = (select auth.uid())), false)
    or coalesce((select created_at from auth.users where id = (select auth.uid())) < '2026-09-18T00:00:00Z'::timestamptz, false)
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('trialing', 'active', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now())
    );
$$;

revoke all on function public.paywall_satisfied() from public, anon;
grant execute on function public.paywall_satisfied() to authenticated;

drop policy if exists paywall_required on public.audio_versions;
create policy paywall_required on public.audio_versions as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.board_invites;
create policy paywall_required on public.board_invites as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.board_members;
create policy paywall_required on public.board_members as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.boards;
create policy paywall_required on public.boards as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.columns;
create policy paywall_required on public.columns as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.external_links;
create policy paywall_required on public.external_links as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.listen_projects;
create policy paywall_required on public.listen_projects as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.playlist_share_comments;
create policy paywall_required on public.playlist_share_comments as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.playlist_share_songs;
create policy paywall_required on public.playlist_share_songs as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.playlist_shares;
create policy paywall_required on public.playlist_shares as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.product_events;
create policy paywall_required on public.product_events as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.profiles;
create policy paywall_required on public.profiles as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.projects;
create policy paywall_required on public.projects as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.saved_collection_links;
create policy paywall_required on public.saved_collection_links as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.share_listen_comments;
create policy paywall_required on public.share_listen_comments as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.song_comments;
create policy paywall_required on public.song_comments as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.song_shares;
create policy paywall_required on public.song_shares as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));
drop policy if exists paywall_required on public.songs;
create policy paywall_required on public.songs as restrictive for all to authenticated
  using ((select public.paywall_satisfied())) with check ((select public.paywall_satisfied()));

-- subscriptions itself is deliberately NOT included: PlanGate reads a user's
-- own subscription row to detect a payment that just landed, and that read
-- must work regardless of paywall_satisfied's answer or a fresh subscriber
-- could never be recognised as one. subscriptions_select_own already scopes
-- it to auth.uid() = user_id, so nobody reads anyone else's.

-- Own files and band members' files. Listeners' share-link reads are a
-- separate rule and unaffected.
drop policy if exists paywall_required_storage on storage.objects;
create policy paywall_required_storage on storage.objects as restrictive for all to authenticated
  using (
    bucket_id <> 'audio'
    or public.audio_object_is_shared(name)
    or (select public.paywall_satisfied())
  )
  with check (bucket_id <> 'audio' or (select public.paywall_satisfied()));
