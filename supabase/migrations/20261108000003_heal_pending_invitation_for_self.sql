-- Self-heal RPC for orphaned auth users who have a pending invitation but no
-- public.users row. Called from AuthContext when fetchProfile returns no rows.
-- No token required — trust is implicit because auth.uid() is the caller's own identity.
create or replace function public.heal_pending_invitation_for_self()
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_email text;
  v_invitation public.user_invitations%rowtype;
  v_existing   public.users%rowtype;
  v_full_name  text;
  v_user       public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Check if public.users already exists — if so, nothing to heal
  select * into v_existing from public.users where id = auth.uid();
  if v_existing.id is not null then
    return v_existing;
  end if;

  select lower(email) into v_auth_email
  from auth.users
  where id = auth.uid();

  -- Find the most-recently-created pending invitation for this email
  select * into v_invitation
  from public.user_invitations
  where lower(email) = v_auth_email
    and status = 'pending'
    and expires_at >= now()
  order by created_at desc
  limit 1;

  if v_invitation.id is null then
    -- No pending invitation — return null so the caller can show a proper error
    return null;
  end if;

  v_full_name := trim(v_invitation.first_name || ' ' || v_invitation.last_name);

  insert into public.users (
    id, name, email, role, department_id,
    first_name, last_name, status,
    invited_at, activated_at, last_active_at
  )
  values (
    auth.uid(), v_full_name, v_auth_email, v_invitation.role, v_invitation.department_id,
    v_invitation.first_name, v_invitation.last_name, 'active',
    v_invitation.created_at, now(), now()
  )
  on conflict (id) do update
    set
      name           = excluded.name,
      email          = excluded.email,
      role           = excluded.role,
      department_id  = excluded.department_id,
      first_name     = excluded.first_name,
      last_name      = excluded.last_name,
      status         = 'active',
      invited_at     = coalesce(public.users.invited_at, excluded.invited_at),
      activated_at   = coalesce(public.users.activated_at, now()),
      last_active_at = now()
  returning * into v_user;

  if v_invitation.role = 'member' and v_invitation.assigned_pastor_id is not null then
    insert into public.pastor_members (pastor_id, member_id)
    values (v_invitation.assigned_pastor_id, auth.uid())
    on conflict (pastor_id, member_id) do nothing;
  end if;

  update public.user_invitations
  set
    status           = 'accepted',
    accepted_at      = now(),
    accepted_user_id = auth.uid(),
    delivery_status  = 'activated',
    delivery_error   = null
  where id = v_invitation.id;

  insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
  values (auth.uid(), 'invited', 'active', 'Invitation accepted (self-heal)', auth.uid());

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_accepted', 'user_invitation', v_invitation.id);

  return v_user;
end;
$$;

grant execute on function public.heal_pending_invitation_for_self() to authenticated;
