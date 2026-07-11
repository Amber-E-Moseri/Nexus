-- Update departments RLS to enforce group space membership visibility
--
-- Before: group spaces visible to super_admin, owner, or org-visibility
-- After: group spaces ONLY visible to super_admin, owner, or explicit members
--
-- This prevents group spaces from leaking via org-visibility flag.

-- Find and replace the departments select policy
-- The policy needs to check group_space_members for group spaces

drop policy if exists "departments_select" on public.departments;

create policy "departments_select" on public.departments
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or
    -- Personal spaces: only owner
    (space_type = 'personal' and owner_id = auth.uid())
    or
    -- Department spaces: user's own dept, or super_admin
    (space_type = 'department' and id = public.current_user_department())
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

-- Write policies: only super_admin can modify
drop policy if exists "departments_write" on public.departments;

create policy "departments_write" on public.departments
  for insert to authenticated
  with check (public.current_user_role() = 'super_admin');

create policy "departments_update" on public.departments
  for update to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

create policy "departments_delete" on public.departments
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

comment on policy "departments_select" on public.departments
  is 'Row-level access control: personal (owner), department (user''s dept), group (owner or member), other (admin or org-visible)';
