-- Fix Programs cross-dept space visibility: replace ORS with Admin, and fix
-- is_programs_team() which was checking department name = 'programs' — a name
-- that doesn't exist. The real signal is either the is_programs dept flag OR
-- a 'programs' space_role row in space_roles.
--
-- Updates three layers:
--   0. is_programs_team()  — fix the broken name check
--   1. departments_select  — sidebar / space list row access
--   2. can_view_space()    — content inside the space (tasks, folders, lists)

-- ─── 0. is_programs_team() ─────────────────────────────────────────────────
-- Old definition checked lower(d.name) = 'programs', but no department is
-- named "Programs". Correct check: is_programs flag OR a 'programs' space_role.

create or replace function public.is_programs_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    -- dept-level flag (set by 20260930000002 via name ilike '%programs%')
    exists (
      select 1
      from public.users u
      join public.departments d on d.id = u.department_id
      where u.id = auth.uid()
        and d.is_programs = true
    )
    or
    -- space-role grant (phase 3 model; covers users whose department isn't Programs)
    public.has_space_role_anywhere(auth.uid(), 'programs')
$$;

comment on function public.is_programs_team() is
  'True when the current user is a Programs department member (is_programs flag) or holds a ''programs'' space role. Used by cross-dept visibility and comms RLS.';

-- ─── 1. departments_select ─────────────────────────────────────────────────

drop policy if exists "departments_select" on public.departments;

create policy "departments_select" on public.departments
  for select to authenticated
  using (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or
    -- Personal spaces: only owner
    (space_type = 'personal' and owner_id = auth.uid())
    or
    -- Department spaces: user's own dept, or Programs members viewing Media/Admin/PFCC
    (
      space_type = 'department'
      and (
        id = public.current_user_department()
        or (public.is_programs_team() and name in ('Media', 'Admin', 'PFCC'))
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
  is 'Row-level access: personal (owner), department (user''s dept, reg-sec/super_admin, or Programs→Media/Admin/PFCC), group (owner or member), other (admin or org-visible)';

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
    -- Same-department access
    if v_dept_id = space_uuid then
      return true;
    end if;

    -- Programs members may view Media, Admin, PFCC department space content
    if public.is_programs_team()
       and exists (
         select 1 from public.departments
         where id = space_uuid and name in ('Media', 'Admin', 'PFCC')
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
