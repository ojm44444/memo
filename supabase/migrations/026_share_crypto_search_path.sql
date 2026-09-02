-- Share links have been dead in production. Fixing the cause, 2 Sept 2026.
--
-- SYMPTOM: every "Copy link" returned
--     42883: function gen_salt(unknown) does not exist
--
-- CAUSE, checked against production rather than guessed: pgcrypto IS
-- installed, in the `extensions` schema. Migration 019 pinned
-- `search_path = public` on every SECURITY DEFINER function to close the
-- mutable-search_path advisory. That pinning excluded `extensions`, so
-- crypt() and gen_salt() stopped resolving.
--
-- WHY IT KILLED EVERY SHARE, NOT ONLY PASSWORD-PROTECTED ONES: in
-- create_song_share the crypt() call sits in a CASE inside the INSERT, which
-- runs on every call. plpgsql prepares that whole statement, so name
-- resolution fails before the CASE branch is ever chosen. A share with no
-- password failed exactly like one with a password.
--
-- In get_song_share_listen and add_share_listen_comment the crypt() call sits
-- inside `if password_hash is not null`, a statement plpgsql only prepares if
-- it is reached. Those two therefore worked for open share links and failed
-- only for password-protected ones. Fixed here as well.
--
-- FIX: widen the pinned search_path to include extensions. It stays pinned, so
-- the 019 advisory stays closed. The extensions schema is owned by postgres
-- and has no CREATE grant for anon, authenticated or public (verified), so it
-- cannot be used to shadow a function into a definer's path.
--
-- Bodies are deliberately untouched. 019 recorded that a well-meant rewrite of
-- live function grants took production down instantly; this changes one
-- setting per function and nothing else.

alter function public.create_song_share(uuid, boolean, text, uuid, text)
  set search_path = public, extensions;

alter function public.get_song_share_listen(text, text)
  set search_path = public, extensions;

alter function public.add_share_listen_comment(text, text, integer, text, text)
  set search_path = public, extensions;

-- The four-argument overload predates share labels (015). The client has sent
-- p_label on every call since, so PostgREST has resolved to the five-argument
-- form throughout and this one is unreachable. Dropped rather than fixed: two
-- overloads differing only by a defaulted trailing argument is an ambiguity
-- waiting to be triggered by a client that omits the label.
drop function if exists public.create_song_share(uuid, boolean, text, uuid);
