-- Enforce the `visibility` column in can_view_space so that:
--   'org'        → all authenticated users
--   'department' → super_admin and dept_lead only
--   'private'    → owner + explicit space_members
--
-- Previously can_view_space only checked space_members membership for
-- program/sandbox spaces, completely ignoring the visibility field.

create or replace function public.can_view_space(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id   uuid;
  v_visibility text;
  v_user_role  text;
  v_dept_id    uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select d.space_type, d.owner_id, d.visibility
    into v_space_type, v_owner_id, v_visibility
  from public.departments d
  where d.id = space_uuid;

  if not found then
    return false;
  end if;

  -- personal spaces: owner only
  if v_space_type = 'personal' then
    return v_owner_id = auth.uid();
  end if;

  -- super_admin sees everything
  if public.is_super_admin() then
    return true;
  end if;

  select u.role, u.department_id
    into v_user_role, v_dept_id
  from public.users u
  where u.id = auth.uid();

  -- department spaces: only members of that department
  if v_space_type = 'department' then
    return v_dept_id = space_uuid;
  end if;

  -- program / sandbox spaces: enforce visibility
  if v_visibility = 'org' then
    -- visible to everyone in the org
    return true;
  end if;

  if v_visibility = 'department' then
    -- restricted to admins (dept_lead and above)
    return v_user_role in ('super_admin', 'dept_lead');
  end if;

  -- visibility = 'private': owner or explicit space_members only
  if v_owner_id = auth.uid() then
    return true;
  end if;

  return exists (
    select 1
    from public.space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = auth.uid()
  );
end;
$$;
