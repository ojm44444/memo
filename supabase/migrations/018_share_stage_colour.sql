-- Add the song's board stage to the share payload.
--
-- The share page is the surface outsiders see, and the locked identity says a
-- song's waveform is drawn in its stage colour. Without the column slug the
-- share page has to fall back to the brand accent, which loses the one signal
-- that says "this is a half-finished demo" versus "this is released".
--
-- Additive only: existing keys are unchanged, so a client that has not shipped
-- yet keeps working.

create or replace function public.get_song_share_listen(
  p_token text,
  p_password text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.song_shares%rowtype;
  v_song public.songs%rowtype;
  v_version public.audio_versions%rowtype;
  v_comments json;
begin
  select * into v_share from public.song_shares where token = p_token;
  if not found then
    return json_build_object('error', 'not_found');
  end if;

  if v_share.expires_at is not null and v_share.expires_at < now() then
    return json_build_object('error', 'expired');
  end if;

  if v_share.password_hash is not null then
    if p_password is null then
      return json_build_object('password_required', true);
    end if;
    if crypt(p_password, v_share.password_hash) <> v_share.password_hash then
      return json_build_object('error', 'bad_password');
    end if;
  end if;

  select * into v_song from public.songs where id = v_share.song_id;
  select * into v_version from public.audio_versions where id = v_share.version_id;

  select coalesce(json_agg(
    json_build_object(
      'id', c.id,
      'author_label', c.author_label,
      'body', c.body,
      'timestamp_ms', c.timestamp_ms,
      'created_at', c.created_at
    ) order by c.timestamp_ms nulls last, c.created_at
  ), '[]'::json)
  into v_comments
  from public.share_listen_comments c
  where c.share_id = v_share.id;

  return json_build_object(
    'song_title', v_song.title,
    'version_label', v_version.label,
    'duration_ms', v_version.duration_ms,
    'storage_path', v_version.storage_path,
    'allow_download', v_share.allow_download,
    'password_required', v_share.password_hash is not null,
    -- New: lets the share page draw the waveform in the song's stage colour.
    'column_slug', v_song.column_slug,
    'comments', v_comments
  );
end;
$$;
