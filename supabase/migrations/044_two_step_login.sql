-- 044: two-step login, enforced by the database (17 Sept 2026, Owen).
--
-- An account that has turned on an authenticator app must present its code
-- in this session (JWT aal = aal2) before any of its data can be read or
-- written. Accounts without two-step login are untouched. Restrictive
-- policies sit on top of every existing rule, so nothing becomes more open.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- Share creation, renaming and revoking go through these, so they carry it too.
create or replace function public.user_owns_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.mfa_satisfied() and exists (
    select 1 from public.boards b
    where b.id = p_board_id and b.user_id = auth.uid()
  );
$function$;

create or replace function public.user_can_access_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.mfa_satisfied() and (
    exists (
      select 1 from public.boards b
      where b.id = p_board_id and b.user_id = auth.uid()
    ) or exists (
      select 1 from public.board_members m
      where m.board_id = p_board_id and m.user_id = auth.uid()
    )
  );
$function$;

drop policy if exists mfa_required on public.audio_versions;
create policy mfa_required on public.audio_versions as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.board_invites;
create policy mfa_required on public.board_invites as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.board_members;
create policy mfa_required on public.board_members as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.boards;
create policy mfa_required on public.boards as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.columns;
create policy mfa_required on public.columns as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.external_links;
create policy mfa_required on public.external_links as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.listen_projects;
create policy mfa_required on public.listen_projects as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.playlist_share_comments;
create policy mfa_required on public.playlist_share_comments as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.playlist_share_songs;
create policy mfa_required on public.playlist_share_songs as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.playlist_shares;
create policy mfa_required on public.playlist_shares as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.product_events;
create policy mfa_required on public.product_events as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.profiles;
create policy mfa_required on public.profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.projects;
create policy mfa_required on public.projects as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.saved_collection_links;
create policy mfa_required on public.saved_collection_links as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.share_listen_comments;
create policy mfa_required on public.share_listen_comments as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.song_comments;
create policy mfa_required on public.song_comments as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.song_shares;
create policy mfa_required on public.song_shares as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.songs;
create policy mfa_required on public.songs as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists mfa_required on public.subscriptions;
create policy mfa_required on public.subscriptions as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Own files and band members' files. Listeners' share-link reads are a
-- separate rule and unaffected.
drop policy if exists mfa_required_storage on storage.objects;
create policy mfa_required_storage on storage.objects as restrictive for all to authenticated
  using (
    bucket_id <> 'audio'
    or public.audio_object_is_shared(name)
    or (select public.mfa_satisfied())
  )
  with check (bucket_id <> 'audio' or (select public.mfa_satisfied()));
