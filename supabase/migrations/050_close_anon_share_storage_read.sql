-- 050: listeners can no longer sign storage URLs themselves (19 Sept 2026,
-- security review).
--
-- APPLY LAST: only after the share-audio edge function is deployed AND the
-- site that gets share audio from it is live. Before that, the share pages
-- still read storage directly under the policy dropped here, and would stop
-- playing.
--
-- audio_storage_shared_read let anyone (anon or signed in) SELECT an audio
-- object that audio_object_is_shared(name) said was on a live link. SELECT on
-- storage.objects is what createSignedUrl checks, so a viewer could mint a
-- URL with any expiry (a year), which outlived revoking the link; the rule
-- ignored the link password; and "allow download = false" meant nothing. The
-- share pages now get 10 minute URLs from share-audio, which checks the link
-- and password with the service role.
--
-- Unchanged: audio_storage_select_own, audio_storage_select_member and the
-- write policies (owners and bandmates read exactly as before), and the two
-- RESTRICTIVE policies (mfa_required_storage, paywall_required_storage). Those
-- still call audio_object_is_shared for signed-in users, so authenticated
-- keeps execute on it; with the permissive rule gone, that clause can only
-- narrow what the own/member rules already allow, never widen it.

drop policy if exists audio_storage_shared_read on storage.objects;

revoke execute on function public.audio_object_is_shared(text) from public, anon;
