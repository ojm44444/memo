-- Track share link opens separately from plays

alter table public.song_shares
  add column if not exists view_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz;

create or replace function public.record_share_view(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.song_shares
  set
    view_count = view_count + 1,
    last_viewed_at = now()
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());
end;
$$;

grant execute on function public.record_share_view(text) to anon, authenticated;
