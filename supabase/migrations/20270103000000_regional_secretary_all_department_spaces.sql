-- Regional secretary should see all department spaces (not just their own —
-- they typically have no department_id at all, being an org-wide role, so
-- without this they see close to none).
--
-- Two layers currently restrict department-space visibility to "your own
-- department" with no regional_secretary carve-out, mirroring super_admin's:
--   1. departments_select (20261229000002) — row-level access to the
--      departments table itself (needed to even see the space in lists/nav).
--   2. can_view_space() (20260812000000) — gates actual content (tasks,
--      folders, lists) inside the space.
-- Both get a regional_secretary branch here, scoped to space_type='department'
-- only — program/sandbox/group/personal visibility rules are untouched.

-- ─── 1. departments_select ──────────────────────────────────────────────

drop policy if exists "departments_select" on public.departments;

create policy "departments_select" on public.departments
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or
    -- Personal spaces: only owner
    (space_type = 'personal' and owner_id = auth.uid())
    or
    -- Department spaces: user's own dept, or super_admin/regional_secretary (all)
    (
      space_type = 'department'
      and (
        id = public.current_user_department()
        or public.current_user_role() = 'regional_secretary'
      )
    )
    or
    -- Group spaces: super_admin, owner, or explicit member
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
    -- Programs, sandboxes: admins always see; non-admins see org-visible
    (
      space_type in ('program', 'sandbox')
      and (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or visibility = 'org'
      )
    )
  );

comment on policy "departments_select" on public.departments
  is 'Row-level access control: personal (owner), department (user''s dept, or super_admin/regional_secretary see all), group (owner or member), other (admin or org-visible)';

-- ─── 2. can_view_space(): content inside the space ──────────────────────

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
