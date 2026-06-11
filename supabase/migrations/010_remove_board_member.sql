-- Owners can remove bandmates from a shared board

create policy "members_delete_owner" on public.board_members
  for delete using (public.user_owns_board(board_id));
