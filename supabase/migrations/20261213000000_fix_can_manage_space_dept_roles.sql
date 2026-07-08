-- Fix can_manage_space to allow ors/programs/media role users to manage their dept space.
-- Previously only 'dept_lead' was allowed; ORS, Programs, and Media leads use different roles.

create or replace function public.can_manage_space(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
  v_role text;
  v_department_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select d.space_type, d.owner_id
    into v_space_type, v_owner_id
  from public.departments d
  where d.id = space_uuid;

  if not found then
    return false;
  end if;

  if v_space_type = 'personal' then
    return v_owner_id = auth.uid();
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  select u.role, u.department_id
    into v_role, v_department_id
  from public.users u
  where u.id = auth.uid();

  if v_space_type = 'department' then
    -- Allow dept_lead and any department-scoped lead role (ors, programs, media)
    -- as long as the user belongs to that department space.
    return v_role in ('dept_lead', 'ors', 'programs', 'media', 'regional_secretary')
      and v_department_id = space_uuid;
  end if;

  if v_owner_id = auth.uid() then
    return true;
  end if;

  return exists (
    select 1
    from public.space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'manager')
  );
end;
$$;
