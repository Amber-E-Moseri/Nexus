-- Convergence migration for sprint_members_write policy
-- This migration ensures the sprint_members_write policy exists with the correct authorization logic.
-- It is deferred from 20260619000001 because it requires can_manage_sprint(uuid),
-- which is created in 20260620000000_sprint_system_hardening.sql.

drop policy if exists "sprint_members_write" on public.sprint_members;
create policy "sprint_members_write" on public.sprint_members
  for all to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
    or (
      is_temporary = true
      and (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1 from public.sprints s
          where s.id = sprint_id and s.created_by = auth.uid()
        )
      )
    )
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
    or (
      is_temporary = true
      and (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1 from public.sprints s
          where s.id = sprint_id and s.created_by = auth.uid()
        )
      )
    )
  );
