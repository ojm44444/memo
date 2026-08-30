-- Correction to 019, applied minutes later.
--
-- 019 revoked EXECUTE on user_owns_board / user_can_access_board. That broke
-- every signed-in query immediately, because Postgres evaluates RLS policy
-- expressions with the querying role's privileges and those two functions ARE
-- the policies for songs, boards, columns and audio_versions:
--
--   ERROR 42501: permission denied for function user_owns_board
--   CONTEXT: SQL statement "select count(*) from public.songs"
--
-- Caught by testing the change against a simulated authenticated session
-- rather than trusting that the migration was correct. Restored here.
grant execute on function public.user_owns_board(uuid) to anon, authenticated;
grant execute on function public.user_can_access_board(uuid) to anon, authenticated;
