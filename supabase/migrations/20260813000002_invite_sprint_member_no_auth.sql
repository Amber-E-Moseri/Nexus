-- Simpler RPC: only handles public.users + sprint_members.
-- Auth user creation is now done in the edge function via the Admin API
-- so that generateLink works reliably.

create or replace function public.add_sprint_member_profile(
  p_user_id   uuid,
  p_email     text,
  p_name      text,
  p_sprint_id uuid,
  p_role      text  default 'contributor',
  p_end_date  date  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid := auth.uid();
begin
  if v_inviter is null then
    raise exception 'Authentication required';
  end if;

  -- Upsert public profile (no-op if already exists)
  insert into public.users (id, email, name, status, is_temporary, created_at)
  values (p_user_id, p_email, p_name, 'pending_activation', true, now())
  on conflict (id) do nothing;

  -- Upsert sprint membership (no-op if already a member — allows resend)
  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, p_user_id, p_role, true, p_end_date, v_inviter
  )
  on conflict (sprint_id, user_id) do nothing;
end;
$$;

grant execute on function public.add_sprint_member_profile(uuid, text, text, uuid, text, date) to authenticated;
