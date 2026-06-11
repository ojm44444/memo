-- Optional labels for share links (band feedback, label A&R, etc.)

alter table public.song_shares
  add column if not exists label text;

create or replace function public.create_song_share(
  p_song_id uuid,
  p_allow_download boolean default false,
  p_password text default null,
  p_version_id uuid default null,
  p_label text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_song public.songs%rowtype;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_song from public.songs where id = p_song_id and deleted_at is null;
  if not found then
    raise exception 'Song not found';
  end if;

  if not public.user_owns_board(v_song.board_id) then
    raise exception 'Not allowed';
  end if;

  insert into public.song_shares (
    song_id,
    board_id,
    created_by,
    allow_download,
    password_hash,
    version_id,
    label
  )
  values (
    p_song_id,
    v_song.board_id,
    auth.uid(),
    coalesce(p_allow_download, false),
    case
      when p_password is null or length(trim(p_password)) = 0 then null
      else crypt(trim(p_password), gen_salt('bf'))
    end,
    p_version_id,
    nullif(trim(p_label), '')
  )
  returning token into v_token;

  return v_token;
end;
$$;

create or replace function public.update_song_share_label(
  p_token text,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.song_shares ss
  set label = nullif(trim(p_label), '')
  where ss.token = p_token
    and ss.revoked_at is null
    and public.user_owns_board(ss.board_id);
end;
$$;

grant execute on function public.update_song_share_label(text, text) to authenticated;
