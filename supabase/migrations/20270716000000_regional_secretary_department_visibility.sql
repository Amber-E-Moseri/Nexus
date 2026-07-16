-- Grant regional_secretary visibility into all department spaces and program/sandbox spaces.
-- Before: department spaces gated to user's own dept; regional_secretary was excluded from
--         the super_admin branch so only saw their own department.

drop policy if exists "departments_select" on public.departments;

create policy "departments_select" on public.departments
  for select to authenticated
  using (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or
    -- Personal spaces: only owner
    (space_type = 'personal' and owner_id = auth.uid())
    or
    -- Department spaces: user's own dept
    (space_type = 'department' and id = public.current_user_department())
    or
    -- Group spaces: super_admin/regional_secretary already caught above; owner or explicit member
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
        public.current_user_role() in ('super_admin', 'dept_lead', 'regional_secretary')
        or visibility = 'org'
      )
    )
  );

comment on policy "departments_select" on public.departments
  is 'Row-level access: personal (owner), department (user''s dept or reg-sec/super_admin), group (owner or member), other (admin or org-visible)';
