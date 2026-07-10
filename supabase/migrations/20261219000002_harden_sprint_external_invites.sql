-- Harden external sprint invitations:
-- - validate sprint member roles before insert
-- - enforce invite permission inside SECURITY DEFINER RPCs
-- - restrict manager/owner assignment to sprint owners or super_admin
-- - write activity_log records for auditability

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
  v_sprint_created_by uuid;
  v_is_sprint_owner boolean := false;
begin
  if v_inviter is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('owner', 'manager', 'contributor', 'viewer') then
    raise exception 'Invalid sprint role: %', p_role;
  end if;

  select created_by into v_sprint_created_by
  from public.sprints
  where id = p_sprint_id;

  if v_sprint_created_by is null then
    raise exception 'Sprint not found';
  end if;

  v_is_sprint_owner := v_sprint_created_by = v_inviter or exists (
    select 1
    from public.sprint_members sm
    where sm.sprint_id = p_sprint_id
      and sm.user_id = v_inviter
      and sm.role = 'owner'
  );

  if not (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(p_sprint_id)
  ) then
    raise exception 'You do not have permission to invite members to this sprint';
  end if;

  if p_role in ('owner', 'manager')
    and public.current_user_role() <> 'super_admin'
    and not v_is_sprint_owner
  then
    raise exception 'Only the sprint owner or a super admin can assign privileged sprint roles';
  end if;

  insert into public.users (id, email, name, status, is_temporary, created_at)
  values (
    p_user_id,
    lower(trim(p_email)),
    coalesce(nullif(trim(p_name), ''), split_part(lower(trim(p_email)), '@', 1)),
    'pending_activation',
    true,
    now()
  )
  on conflict (id) do nothing;

  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, p_user_id, p_role, true, p_end_date, v_inviter
  )
  on conflict (sprint_id, user_id) do nothing;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (v_inviter, 'sprint_external_member_added', 'sprint', p_sprint_id);
end;
$$;

grant execute on function public.add_sprint_member_profile(uuid, text, text, uuid, text, date) to authenticated;

create or replace function public.invite_external_sprint_member(
  p_email            text,
  p_name             text,
  p_sprint_id        uuid,
  p_role             text    default 'contributor',
  p_end_date         date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id   uuid;
  v_inviter   uuid := auth.uid();
  v_sprint_created_by uuid;
  v_is_sprint_owner boolean := false;
begin
  if v_inviter is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('owner', 'manager', 'contributor', 'viewer') then
    raise exception 'Invalid sprint role: %', p_role;
  end if;

  select created_by into v_sprint_created_by
  from public.sprints
  where id = p_sprint_id;

  if v_sprint_created_by is null then
    raise exception 'Sprint not found';
  end if;

  v_is_sprint_owner := v_sprint_created_by = v_inviter or exists (
    select 1
    from public.sprint_members sm
    where sm.sprint_id = p_sprint_id
      and sm.user_id = v_inviter
      and sm.role = 'owner'
  );

  if not (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(p_sprint_id)
  ) then
    raise exception 'You do not have permission to invite members to this sprint';
  end if;

  if p_role in ('owner', 'manager')
    and public.current_user_role() <> 'super_admin'
    and not v_is_sprint_owner
  then
    raise exception 'Only the sprint owner or a super admin can assign privileged sprint roles';
  end if;

  p_email := lower(trim(p_email));

  select id into v_user_id
  from auth.users
  where email = p_email
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      '',
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)), 'is_temporary', true),
      'authenticated',
      'authenticated'
    );

    insert into public.users (id, email, name, status, is_temporary, created_at)
    values (
      v_user_id,
      p_email,
      coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)),
      'pending_activation',
      true,
      now()
    );
  end if;

  if exists (
    select 1 from public.sprint_members
    where sprint_id = p_sprint_id and user_id = v_user_id
  ) then
    raise exception 'User is already a member of this sprint';
  end if;

  insert into public.sprint_members (
    sprint_id, user_id, role, is_temporary, membership_end_date, invited_by
  ) values (
    p_sprint_id, v_user_id, p_role, true, p_end_date, v_inviter
  );

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (v_inviter, 'sprint_external_member_invited', 'sprint', p_sprint_id);

  return v_user_id;
end;
$$;

grant execute on function public.invite_external_sprint_member(text, text, uuid, text, date) to authenticated;
