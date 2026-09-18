-- 048: close a leftover share function (18 Sept 2026, security review).
--
-- get_playlist_share_listen(p_token) is not called anywhere in the app and
-- is not defined in any migration (019 only granted it). It returned a live
-- playlist's track titles and storage paths without checking the link's
-- password, so a password-protected link could be opened with the link
-- alone. Nobody can call it now. Kept, not dropped, so nothing that might
-- still reference it fails at deploy time.

revoke execute on function public.get_playlist_share_listen(text) from public, anon, authenticated;
