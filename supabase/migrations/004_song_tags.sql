-- Song tags for filtering (projects stay local per-board for now)

alter table public.songs
  add column if not exists tags text[] not null default '{}';

create index if not exists songs_tags_gin_idx on public.songs using gin (tags);

create or replace function public.ensure_my_board()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bid uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, display_name)
  select uid, u.email from auth.users u where u.id = uid
  on conflict (id) do nothing;

  select id into bid from public.boards where user_id = uid order by created_at limit 1;

  if bid is null then
    insert into public.boards (user_id, name)
    values (uid, 'My Board')
    returning id into bid;

    insert into public.columns (board_id, slug, title, position) values
      (bid, 'inbox', 'Inbox', 0)
    on conflict do nothing;
  end if;

  return bid;
end;
$$;

grant execute on function public.ensure_my_board() to authenticated;
