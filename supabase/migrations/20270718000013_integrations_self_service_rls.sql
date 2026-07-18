-- Self-service integrations: allow all roles to create private integrations
-- and dept_leads to create departmental integrations.
-- The SELECT policy (20261229000000_fix_external_integrations_rls_db_fallback.sql) already
-- enforces scope-aware visibility via user_ids/department_ids — no SELECT changes needed.

drop policy if exists "external_integrations_write" on public.external_integrations;

-- INSERT: any authenticated user can add a private (user-scoped) integration they own;
-- dept_lead can also add a department-scoped integration for their own department.
create policy "integrations_insert" on public.external_integrations
  for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or (
      scope = 'users'
      and array[auth.uid()] <@ user_ids
      and created_by = auth.uid()
    )
    or (
      public.current_user_role() = 'dept_lead'
      and scope = 'departments'
      and array[public.current_user_department()] <@ department_ids
      and created_by = auth.uid()
    )
  );

-- UPDATE/DELETE: row owner or super_admin; scope-change restrictions mirror insert rules.
create policy "integrations_write" on public.external_integrations
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (
      created_by = auth.uid()
      and (
        scope = 'users'
        or (scope = 'departments' and public.current_user_role() = 'dept_lead')
      )
    )
  );
