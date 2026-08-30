-- Security advisor cleanup, 30 Aug 2026.
--
-- Three real findings, verified against production rather than taken on trust:
--
-- 1. public.set_updated_at() had a MUTABLE search_path. It is a SECURITY
--    INVOKER trigger so the risk is lower than for a definer function, but a
--    mutable search_path on a trigger that fires on nearly every write is a
--    known privilege-escalation vector and costs nothing to close.
--
-- 2. Eighteen SECURITY DEFINER functions were callable over the public REST
--    API by the `anon` role. Most of those are owner-only operations that
--    should never be reachable without a session, and three are internal
--    helpers that should not be in the API surface at all.
--
-- The share and invite flows deliberately work with NO account, so the
-- functions those pages call keep their anon grant. Checked against the
-- client: SharePage, PlaylistSharePage and InvitePage call exactly six.

-- ── 1. Pin the trigger function's search_path ──────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 2. Internal only: never callable over the API ──────────────────────────
-- handle_new_user is an auth trigger; user_owns_board / user_can_access_board
-- exist to be called BY row level security policies, not by clients. RLS
-- evaluates them internally regardless of these grants.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- DO NOT revoke EXECUTE on user_owns_board / user_can_access_board. It was
-- tried here and it took production down instantly: Postgres evaluates RLS
-- policy expressions with the QUERYING role's privileges, and these two
-- functions ARE the policies for songs, boards, columns and audio_versions.
-- Revoking gave every signed-in query:
--     ERROR 42501: permission denied for function user_owns_board
-- See 020_restore_rls_helper_execute.sql. They stay executable, and their
-- real hardening is what they already have: SECURITY DEFINER with a pinned
-- search_path, returning only a boolean about the caller's own access.

-- ── 3. Owner-only operations: signed-in users only, never anon ─────────────
revoke all on function public.ensure_my_board() from public, anon;
grant execute on function public.ensure_my_board() to authenticated;

revoke all on function public.my_storage_usage() from public, anon;
grant execute on function public.my_storage_usage() to authenticated;

revoke all on function public.create_song_share(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.create_song_share(uuid, boolean, text, uuid) to authenticated;

revoke all on function public.create_song_share(uuid, boolean, text, uuid, text) from public, anon;
grant execute on function public.create_song_share(uuid, boolean, text, uuid, text) to authenticated;

revoke all on function public.create_playlist_share(uuid, uuid[], text, boolean) from public, anon;
grant execute on function public.create_playlist_share(uuid, uuid[], text, boolean) to authenticated;

revoke all on function public.revoke_song_share(text) from public, anon;
grant execute on function public.revoke_song_share(text) to authenticated;

revoke all on function public.renew_song_share(text) from public, anon;
grant execute on function public.renew_song_share(text) to authenticated;

revoke all on function public.update_song_share_label(text, text) from public, anon;
grant execute on function public.update_song_share_label(text, text) to authenticated;

-- Accepting an invite writes a membership row for the current user, so it
-- requires a session. The PREVIEW stays anon so the invite page can show what
-- you are being invited to before you sign in.
revoke all on function public.accept_board_invite(text) from public, anon;
grant execute on function public.accept_board_invite(text) to authenticated;

-- ── 4. Genuinely public: the no-account share and invite surface ───────────
-- These MUST stay anon-executable. A producer opening a share link has no
-- account, and that is the product's most distinctive feature.
grant execute on function public.get_song_share_listen(text, text) to anon, authenticated;
grant execute on function public.get_playlist_share_listen(text) to anon, authenticated;
grant execute on function public.add_share_listen_comment(text, text, integer, text, text) to anon, authenticated;
grant execute on function public.record_share_view(text) to anon, authenticated;
grant execute on function public.record_share_listen(text) to anon, authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
