-- Grant Programs department members read access to Media, ORS, and PFCC spaces.
-- Previously: department spaces were gated to users whose department_id matched the space.
-- Programs members had no visibility into other departments' spaces or content.
--
-- Two layers updated:
--   1. departments_select — row-level access to the departments table (sidebar, space lists)
--   2. can_view_space()   — content inside the space (tasks, folders, lists via RLS)
--
-- Also cleans up a stale stacking policy:
--   "departments_select_spaces" (20260621000000) was never dropped by any later migration
--   and silently OR'd with "departments_select", producing redundant permissive coverage.
--   Dropping it here consolidates to a single authoritative SELECT policy.
--
-- is_programs_team() is SECURITY DEFINER (20260930000003) — safe to call from within
-- a policy on the departments table; bypasses the caller's RLS context.
--
-- Name-based match (name IN ('Media', 'ORS', 'PFCC')) is intentional — no department_key
-- column exists. Add one if more cross-dept rules accumulate.

-- ─── 1. departments_select ─────────────────────────────────────────────────

-- Drop both stale policies before replacing with a single authoritative one
drop policy if exists "departments_select_spaces" on public.departments;  -- from 20260621, never cleaned up
drop policy if exists "departments_select" on public.departments;

create policy "departments_select" on public.departments
  for select to authenticated
  using (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or
    -- Personal spaces: only owner
    (space_type = 'personal' and owner_id = auth.uid())
    or
    -- Department spaces: user's own dept, or Programs members viewing Media/ORS/PFCC
    (
      space_type = 'department'
      and (
        id = public.current_user_department()
        or (public.is_programs_team() and name in ('Media', 'ORS', 'PFCC'))
      )
    )
    or
    -- Group spaces: owner or explicit member
    (
      space_type = 'group'
      and (
        owner_id = auth.uid()
        or exists (
          select 1 from public.group_space_members gsm
          where gsm.group_space_id = id
            and gsm.user_id = auth.uid()
        )
      )
    )
    or
    -- Program/sandbox spaces: admins always see; non-admins see org-visible
    (
      space_type in ('program', 'sandbox')
      and (
        public.current_user_role() in ('super_admin', 'dept_lead', 'regional_secretary')
        or visibility = 'org'
      )
    )
  );

comment on policy "departments_select" on public.departments
  is 'Row-level access: personal (owner), department (user''s dept, reg-sec/super_admin, or Programs→Media/ORS/PFCC), group (owner or member), other (admin or org-visible)';

-- ─── 2. can_view_space(): content inside the space ─────────────────────────

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

  -- regional_secretary sees every department space
  if v_space_type = 'department' and public.current_user_role() = 'regional_secretary' then
    return true;
  end if;

  if v_space_type = 'department' then
    -- Same-department access (existing rule)
    if v_dept_id = space_uuid then
      return true;
    end if;

    -- Programs members may view Media, ORS, PFCC department space content
    -- (name-based: no department_key column; add one if more rules accumulate)
    if public.is_programs_team()
       and exists (
         select 1 from public.departments
         where id = space_uuid and name in ('Media', 'ORS', 'PFCC')
       )
    then
      return true;
    end if;

    return false;
  end if;

  -- program / sandbox spaces: enforce visibility
  if v_visibility = 'org' then
    return true;
  end if;

  if v_visibility = 'department' then
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
