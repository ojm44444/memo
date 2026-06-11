-- Extend an active share link expiry by 90 days

create or replace function public.renew_song_share(p_token text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz;
begin
  update public.song_shares ss
  set expires_at = now() + interval '90 days'
  where ss.token = p_token
    and ss.revoked_at is null
    and public.user_owns_board(ss.board_id)
  returning ss.expires_at into v_expires;

  if not found then
    raise exception 'Share link not found';
  end if;

  return v_expires;
end;
$$;

grant execute on function public.renew_song_share(text) to authenticated;
