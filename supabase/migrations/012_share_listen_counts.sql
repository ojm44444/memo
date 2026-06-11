-- Track how often share links are played

alter table public.song_shares
  add column if not exists listen_count integer not null default 0,
  add column if not exists last_listened_at timestamptz;

create or replace function public.record_share_listen(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.song_shares
  set
    listen_count = listen_count + 1,
    last_listened_at = now()
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());
end;
$$;

grant execute on function public.record_share_listen(text) to anon, authenticated;
