-- Fix: creating a list (or folder, or anything else gated by
-- can_manage_space()) as regional_secretary fails with
-- "new row violates row-level security policy for table lists".
--
-- can_manage_space() only bypasses for is_super_admin() plus an explicit
-- space_roles row (dept_lead/ors/programs/media) for department spaces, or
-- space_members owner/manager for program/sandbox spaces. Unlike
-- tasks_update/tasks_delete/meetings_*/automation-engine (all fixed earlier
-- this session), it never got a regional_secretary bypass, even though
-- regional_secretary is treated as an org-wide manager-equivalent role
-- everywhere else. 15 policies delegate to this function (lists, folders,
-- and others), so this one fix covers all of them.

create or replace function public.can_manage_space(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_space_type text;
  v_owner_id uuid;
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

  if public.current_user_role() = 'regional_secretary' then
    return true;
  end if;

  if v_space_type = 'department' then
    return exists (
      select 1 from public.space_roles sr
      where sr.user_id = auth.uid()
        and sr.space_id = space_uuid
        and sr.role in ('dept_lead', 'ors', 'programs', 'media')
    );
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
