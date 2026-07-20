-- add_existing_user_to_sprint was missing the p_end_date param that
-- add_sprint_member_by_id had, so membership expiry couldn't be set.
-- This recreates the function with the optional p_end_date param so
-- addSprintMember() in the frontend can fully replace the super_admin-only
-- add_sprint_member_by_id call.

create or replace function public.add_existing_user_to_sprint(
  p_sprint_id uuid,
  p_user_id   uuid,
  p_role      text default 'contributor',
  p_end_date  date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_sprint_created_by uuid;
  v_is_sprint_owner boolean;
begin
  if v_caller is null then
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

  -- Must be a sprint member, manager, dept_lead, or super_admin to add people
  if not (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(p_sprint_id)
    or public.is_sprint_member(p_sprint_id)
  ) then
    raise exception 'You must be a sprint member to add others to this sprint';
  end if;

  -- Only super_admin or sprint owner can assign privileged roles
  v_is_sprint_owner := v_sprint_created_by = v_caller or exists (
    select 1 from public.sprint_members
    where sprint_id = p_sprint_id and user_id = v_caller and role = 'owner'
  );

  if p_role in ('owner', 'manager')
    and public.current_user_role() <> 'super_admin'
    and not v_is_sprint_owner
  then
    raise exception 'Only the sprint owner or a super admin can assign privileged sprint roles';
  end if;

  -- Target user must exist and be active
  if not exists (
    select 1 from public.users where id = p_user_id and status = 'active'
  ) then
    raise exception 'User not found or inactive';
  end if;

  insert into public.sprint_members (sprint_id, user_id, role, membership_end_date, invited_by)
  values (p_sprint_id, p_user_id, p_role, p_end_date, v_caller)
  on conflict (sprint_id, user_id) do nothing;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (v_caller, 'sprint_member_added', 'sprint', p_sprint_id);
end;
$$;

notify pgrst, 'reload schema';
