create or replace function public.create_user_invitation(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_department_id uuid,
  p_role text,
  p_assigned_pastor_id uuid default null
)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_existing public.user_invitations%rowtype;
  v_email text := lower(trim(p_email));
  v_result public.user_invitations%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.id is null then
    raise exception 'Authentication required';
  end if;

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to invite users';
  end if;

  if p_role not in ('super_admin', 'dept_lead', 'pastor', 'member') then
    raise exception 'Invalid role';
  end if;

  if v_actor.role = 'dept_lead' then
    if p_role <> 'member' then
      raise exception 'Department leads may invite members only';
    end if;

    if p_department_id is distinct from v_actor.department_id then
      raise exception 'Department leads may invite within their own department only';
    end if;
  end if;

  if exists (
    select 1
    from public.users existing_user
    where lower(existing_user.email) = v_email
      and existing_user.status <> 'archived'
  ) then
    raise exception 'A user with this email already exists';
  end if;

  select *
  into v_existing
  from public.user_invitations
  where lower(email) = v_email
    and status = 'pending';

  if v_existing.id is not null then
    raise exception 'A pending invitation already exists for this email';
  end if;

  if p_assigned_pastor_id is not null then
    if not exists (
      select 1
      from public.users pastor_user
      where pastor_user.id = p_assigned_pastor_id
        and pastor_user.role = 'pastor'
        and pastor_user.department_id = p_department_id
    ) then
      raise exception 'Assigned pastor must be an active pastor in the selected department';
    end if;
  end if;

  insert into public.user_invitations (
    first_name,
    last_name,
    email,
    department_id,
    role,
    assigned_pastor_id,
    invited_by,
    invitation_token,
    status
  )
  values (
    trim(p_first_name),
    trim(p_last_name),
    v_email,
    p_department_id,
    p_role,
    p_assigned_pastor_id,
    auth.uid(),
    substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48),
    'pending'
  )
  returning *
  into v_result;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_created', 'user_invitation', v_result.id);

  return v_result;
end;
$$;

create or replace function public.cancel_user_invitation(p_invitation_id uuid)
returns public.user_invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_invitation public.user_invitations%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to cancel invitations';
  end if;

  select *
  into v_invitation
  from public.user_invitations
  where id = p_invitation_id;

  if v_invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_actor.role = 'dept_lead' and v_invitation.department_id is distinct from v_actor.department_id then
    raise exception 'Department leads may cancel invitations for their own department only';
  end if;

  update public.user_invitations
  set
    status = 'cancelled',
    cancelled_at = now(),
    delivery_status = 'cancelled',
    delivery_error = null
  where id = p_invitation_id
  returning *
  into v_invitation;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_cancelled', 'user_invitation', v_invitation.id);

  return v_invitation;
end;
$$;

create or replace function public.accept_user_invitation(p_token text)
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_auth_email text;
  v_user public.users%rowtype;
  v_full_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_invitations
  set
    status = 'expired',
    delivery_status = 'expired',
    delivery_error = null
  where invitation_token = p_token
    and status = 'pending'
    and expires_at < now();

  select *
  into v_invitation
  from public.user_invitations
  where invitation_token = p_token
    and status = 'pending'
    and expires_at >= now();

  if v_invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;

  select lower(email)
  into v_auth_email
  from auth.users
  where id = auth.uid();

  if v_auth_email is distinct from lower(v_invitation.email) then
    raise exception 'Signed-in email does not match invitation email';
  end if;

  v_full_name := trim(v_invitation.first_name || ' ' || v_invitation.last_name);

  insert into public.users (
    id,
    name,
    email,
    role,
    department_id,
    first_name,
    last_name,
    status,
    invited_at,
    activated_at,
    last_active_at
  )
  values (
    auth.uid(),
    v_full_name,
    lower(v_invitation.email),
    v_invitation.role,
    v_invitation.department_id,
    v_invitation.first_name,
    v_invitation.last_name,
    'active',
    v_invitation.created_at,
    now(),
    now()
  )
  on conflict (id) do update
    set
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      department_id = excluded.department_id,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      status = 'active',
      invited_at = coalesce(public.users.invited_at, excluded.invited_at),
      activated_at = coalesce(public.users.activated_at, now()),
      last_active_at = now()
  returning *
  into v_user;

  if v_invitation.role = 'member' then
    delete from public.pastor_members
    where member_id = auth.uid();

    if v_invitation.assigned_pastor_id is not null then
      insert into public.pastor_members (pastor_id, member_id)
      values (v_invitation.assigned_pastor_id, auth.uid())
      on conflict (pastor_id, member_id) do nothing;
    end if;
  end if;

  update public.user_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_user_id = auth.uid(),
    delivery_status = 'activated',
    delivery_error = null
  where id = v_invitation.id;

  insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
  values (auth.uid(), 'invited', 'active', 'Invitation accepted', auth.uid());

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'user_activated', 'user', v_user.id);

  return v_user;
end;
$$;

create or replace function public.update_user_membership(
  p_user_id uuid,
  p_role text default null,
  p_department_id uuid default null,
  p_status text default null,
  p_assigned_pastor_id uuid default null,
  p_reason text default null
)
returns public.users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_next_role text;
  v_next_department uuid;
  v_next_status text;
  v_result public.users%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  select *
  into v_target
  from public.users
  where id = p_user_id;

  if v_actor.id is null or v_target.id is null then
    raise exception 'User not found';
  end if;

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to manage users';
  end if;

  if v_actor.role = 'dept_lead' then
    if v_target.role <> 'member' then
      raise exception 'Department leads may manage members only';
    end if;

    if v_target.department_id is distinct from v_actor.department_id then
      raise exception 'Department leads may manage members in their own department only';
    end if;

    if p_role is not null and p_role <> v_target.role then
      raise exception 'Department leads may not change roles';
    end if;

    if p_department_id is not null and p_department_id is distinct from v_actor.department_id then
      raise exception 'Department leads may not transfer members outside their own department';
    end if;
  end if;

  v_next_role := coalesce(p_role, v_target.role);
  v_next_department := coalesce(p_department_id, v_target.department_id);
  v_next_status := coalesce(p_status, v_target.status);

  if v_next_role not in ('super_admin', 'dept_lead', 'pastor', 'member') then
    raise exception 'Invalid role';
  end if;

  if v_next_status not in ('invited', 'pending_activation', 'active', 'inactive', 'archived') then
    raise exception 'Invalid status';
  end if;

  if p_assigned_pastor_id is not null then
    if not exists (
      select 1
      from public.users pastor_user
      where pastor_user.id = p_assigned_pastor_id
        and pastor_user.role = 'pastor'
        and pastor_user.department_id = v_next_department
    ) then
      raise exception 'Assigned pastor must belong to the selected department';
    end if;
  end if;

  update public.users
  set
    role = v_next_role,
    department_id = v_next_department,
    status = v_next_status,
    activated_at = case when v_next_status = 'active' then coalesce(activated_at, now()) else activated_at end,
    inactivated_at = case when v_next_status = 'inactive' then now() else inactivated_at end,
    archived_at = case when v_next_status = 'archived' then now() else archived_at end
  where id = p_user_id
  returning *
  into v_result;

  if v_target.department_id is distinct from v_next_department then
    insert into public.department_assignment_history (
      user_id,
      from_department_id,
      to_department_id,
      changed_by
    )
    values (
      p_user_id,
      v_target.department_id,
      v_next_department,
      auth.uid()
    );

    insert into public.activity_log (user_id, action, entity_type, entity_id)
    values (auth.uid(), 'department_membership_changed', 'user', p_user_id);
  end if;

  if v_target.status is distinct from v_next_status then
    insert into public.user_status_history (user_id, from_status, to_status, reason, changed_by)
    values (p_user_id, v_target.status, v_next_status, p_reason, auth.uid());

    insert into public.activity_log (user_id, action, entity_type, entity_id)
    values (auth.uid(), 'user_status_changed', 'user', p_user_id);
  end if;

  if v_next_role <> 'member' then
    delete from public.pastor_members where member_id = p_user_id;
  else
    delete from public.pastor_members where member_id = p_user_id;

    if p_assigned_pastor_id is not null then
      insert into public.pastor_members (pastor_id, member_id)
      values (p_assigned_pastor_id, p_user_id)
      on conflict (pastor_id, member_id) do nothing;
    end if;
  end if;

  return v_result;
end;
$$;

create or replace function public.assign_pastor_member(p_pastor_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_pastor public.users%rowtype;
  v_member public.users%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to manage pastoral assignments';
  end if;

  select * into v_pastor from public.users where id = p_pastor_id;
  select * into v_member from public.users where id = p_member_id;

  if v_pastor.role <> 'pastor' then
    raise exception 'Selected user is not a pastor';
  end if;

  if v_member.role <> 'member' then
    raise exception 'Selected user is not a member';
  end if;

  if v_pastor.department_id is distinct from v_member.department_id then
    raise exception 'Pastor and member must be in the same department';
  end if;

  if v_actor.role = 'dept_lead' and v_actor.department_id is distinct from v_member.department_id then
    raise exception 'Department leads may manage assignments in their own department only';
  end if;

  delete from public.pastor_members
  where member_id = p_member_id;

  insert into public.pastor_members (pastor_id, member_id)
  values (p_pastor_id, p_member_id);

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'pastor_assignment_changed', 'user', p_member_id);
end;
$$;

create or replace function public.remove_pastor_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_member public.users%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to manage pastoral assignments';
  end if;

  select *
  into v_member
  from public.users
  where id = p_member_id;

  if v_member.id is null then
    raise exception 'Member not found';
  end if;

  if v_actor.role = 'dept_lead' and v_actor.department_id is distinct from v_member.department_id then
    raise exception 'Department leads may manage assignments in their own department only';
  end if;

  delete from public.pastor_members
  where member_id = p_member_id;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'pastor_assignment_changed', 'user', p_member_id);
end;
$$;
