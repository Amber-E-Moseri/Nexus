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

  v_token := encode(gen_random_bytes(24), 'hex');
  v_hash := md5(v_token);

  update public.user_invitations
  set
    invitation_token = null,
    invitation_token_hash = v_hash,
    expires_at = case when p_extend_expiry then now() + interval '7 days' else expires_at end
  where id = p_invitation_id
  returning public.user_invitations.id, public.user_invitations.expires_at
  into invitation_id, expires_at;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_link_issued', 'user_invitation', p_invitation_id);

  invitation_token := v_token;
  return next;
end;
$$;

create or replace function public.resend_user_invitation(p_invitation_id uuid)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to resend invitations';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may resend invitations for their own department only';
  end if;

  update public.user_invitations
  set
    resent_at = now(),
    expires_at = now() + interval '7 days',
    status = 'pending',
    delivery_status = 'pending',
    delivery_error = null
  where id = p_invitation_id
  returning *
  into v_invitation;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_resent', 'user_invitation', v_invitation.id);

  return v_invitation;
end;
$$;

create or replace function public.update_user_invitation_expiry(
  p_invitation_id uuid,
  p_expires_at timestamptz
)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to update invitation expiry';
  end if;

  select * into v_invitation from public.user_invitations where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may manage invitations for their own department only';
  end if;

  if p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  update public.user_invitations
  set
    expires_at = p_expires_at,
    status = case when status = 'expired' then 'pending' else status end,
    delivery_status = case when delivery_status = 'expired' then 'pending' else delivery_status end
  where id = p_invitation_id
  returning *
  into v_invitation;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_expiry_updated', 'user_invitation', v_invitation.id);

  return v_invitation;
end;
$$;
