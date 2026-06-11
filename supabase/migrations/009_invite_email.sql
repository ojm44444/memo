-- Optional invitee email for tracking + mailto handoff

alter table public.board_invites
  add column if not exists invitee_email text;

create index if not exists board_invites_email_idx
  on public.board_invites (board_id, invitee_email)
  where invitee_email is not null and revoked_at is null;
