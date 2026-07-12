-- Allow 'group_member' as an invitation role.
--
-- Two things block group_member invitations:
--   1. user_invitations_role_check (re-added in 20261230000006_widen_...) lists
--      super_admin/dept_lead/pastor/regional_secretary/member — no group_member.
--   2. create_user_invitation rejects any role outside that same set.
--
-- Group members are invited to a group space with no department. This widens
-- the table constraint to include group_member (keeping the set aligned with
-- users_role_check from 20261230000000) and updates the RPC to match. All other
-- rules (dept_lead may only invite 'member'; a department or group space is
-- required) are preserved.

alter table public.user_invitations
  drop constraint if exists user_invitations_role_check;

alter table public.user_invitations
  add constraint user_invitations_role_check
  check (role in (
    'super_admin',
    'dept_lead',
    'pastor',
    'regional_secretary',
    'member',
    'group_member'
  ));

create or replace function public.create_user_invitation(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_department_id uuid default null,
  p_role text default 'member',
  p_assigned_pastor_id uuid default null,
  p_message text default null,
  p_group_name text default null,
  p_group_space_ids uuid[] default null
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
  v_token text;
  v_result public.user_invitations%rowtype;
begin
  select * into v_actor from public.users where id = auth.uid();

  if v_actor.id is null then
    raise exception 'Authentication required';
  end if;

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to invite users';
  end if;

  if p_role not in ('super_admin', 'dept_lead', 'pastor', 'member', 'group_member') then
    raise exception 'Invalid role';
  end if;

  if p_group_name is not null and p_group_name not in ('Central', 'Central-East', 'West') then
    raise exception 'Invalid group';
  end if;

  if v_actor.role = 'dept_lead' then
    if p_role <> 'member' then
      raise exception 'Department leads may invite members only';
    end if;

    if p_department_id is distinct from v_actor.department_id then
      raise exception 'Department leads may invite within their own department only';
    end if;
  end if;

  -- Require either a department or at least one group space
  if p_department_id is null and (p_group_space_ids is null or array_length(p_group_space_ids, 1) is null or array_length(p_group_space_ids, 1) = 0) then
    raise exception 'An invitation must have a department or at least one group space';
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
    if p_department_id is null then
      raise exception 'A department is required when assigning a pastor';
    end if;
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

  if p_group_space_ids is not null and array_length(p_group_space_ids, 1) > 0 then
    if exists (
      select 1
      from unnest(p_group_space_ids) as requested_space_id
      left join public.departments d
        on d.id = requested_space_id
       and d.space_type = 'group'
       and d.status = 'active'
      where d.id is null
    ) then
      raise exception 'One or more selected group spaces are invalid';
    end if;
  end if;

  v_token := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 48);

  insert into public.user_invitations (
    first_name,
    last_name,
    email,
    department_id,
    role,
    assigned_pastor_id,
    invited_by,
    invitation_token,
    invitation_token_hash,
    invite_message,
    group_name,
    group_space_ids,
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
    v_token,
    md5(v_token),
    nullif(trim(p_message), ''),
    p_group_name,
    coalesce(p_group_space_ids, array[]::uuid[]),
    'pending'
  )
  returning *
  into v_result;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), 'invitation_created', 'user_invitation', v_result.id);

  return v_result;
end;
$$;

grant execute on function public.create_user_invitation(text, text, text, uuid, text, uuid, text, text, uuid[]) to authenticated;
