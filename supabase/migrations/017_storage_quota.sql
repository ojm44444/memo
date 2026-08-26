-- Per-account cloud storage quota, enforced at the storage layer.
--
-- Trial infrastructure landing early: this bounds cost before any tester
-- arrives. Enforced in an RLS policy on storage.objects rather than in the
-- client, because a client-side check is a suggestion, not a limit.
--
-- Fair use: 10 GB per account (commercial spec).

create or replace function public.account_storage_bytes(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = public, storage
stable
as $$
  -- Objects are stored under `<user_id>/<board_id>/<song_id>/<version>.<ext>`,
  -- so the first path segment is the owning account.
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'audio'
    and (storage.foldername(o.name))[1] = p_user_id::text
$$;

comment on function public.account_storage_bytes is
  'Total bytes stored in the audio bucket for one account. Used by the quota policy.';

-- 10 GB fair use.
create or replace function public.account_within_storage_quota(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.account_storage_bytes(p_user_id) < (10::bigint * 1024 * 1024 * 1024)
$$;

comment on function public.account_within_storage_quota is
  'False once an account has reached its cloud fair-use limit. Blocks new uploads; existing audio stays readable and downloadable.';

-- Replace the insert policy so an upload past the limit is refused by the
-- database. Ownership check is unchanged; the quota is an additional gate.
drop policy if exists "audio_storage_insert_own" on storage.objects;
create policy "audio_storage_insert_own" on storage.objects for insert with check (
  bucket_id = 'audio'
  and auth.uid()::text = (storage.foldername(name))[1]
  and public.account_within_storage_quota(auth.uid())
);

-- Deliberately NOT applied to select, update or delete:
--   select  - a full account must still be able to play and download its audio
--   delete  - a full account must be able to free space
--   update  - metadata edits must not be blocked by being full
-- Being over quota stops you adding, never stops you retrieving. Locking
-- someone out of their own recordings is the one thing this must never do.

-- Read-side helper for the in-app "near full" state, so the client shows a
-- real number rather than an estimate.
create or replace function public.my_storage_usage()
returns table (used_bytes bigint, quota_bytes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    public.account_storage_bytes(auth.uid()) as used_bytes,
    (10::bigint * 1024 * 1024 * 1024) as quota_bytes
$$;

grant execute on function public.my_storage_usage() to authenticated;
