-- Fix: issue_user_invitation_token was setting invitation_token to NULL instead of the generated token
-- Recreate the function with the correct token assignment

create or replace function public.issue_user_invitation_token(
  p_invitation_id uuid,
  p_extend_expiry boolean default false
)
returns table (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
  v_token text;
  v_hash text;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.id is null then
    raise exception 'Authentication required';
  end if;

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to issue invitation links';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may issue invitation links for their own department only';
  end if;

  if v_invitation.status in ('accepted', 'expired', 'revoked') then
    raise exception 'Invitation cannot issue a new link while %', v_invitation.status;
  end if;

  v_token := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48);
  v_hash := md5(v_token);

  update public.user_invitations
  set
    invitation_token = v_token,
    invitation_token_hash = v_hash,
    expires_at = case when p_extend_expiry then now() + interval '7 days' else public.user_invitations.expires_at end
  where id = p_invitation_id
  returning public.user_invitations.id, public.user_invitations.expires_at
  into invitation_id, expires_at;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_link_issued', 'user_invitation', p_invitation_id);

  invitation_token := v_token;
  return next;
end;
$$;
