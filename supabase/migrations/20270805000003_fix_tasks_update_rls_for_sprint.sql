-- Fix: tasks_update RLS policy was blocking sprint team members from updating sprint tasks
-- because it only allowed created_by, super_admin, or dept_leads (which requires department_id)
--
-- For sprint tasks (department_id = null), the policy was:
-- - created_by: doesn't apply if someone else created it
-- - super_admin: fine, but limits who can edit
-- - has_space_role(null, 'dept_lead'): fails because null department_id
--
-- Add: allow sprint team members to update sprint tasks (their own fields, assignees, teams, etc)

drop policy if exists "tasks_update" on public.tasks;

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (sprint_id is not null and exists(
      select 1 from public.sprint_team_members stm
      where stm.sprint_id = sprint_id
        and stm.user_id = auth.uid()
    ))
  )
  with check (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (sprint_id is not null and exists(
      select 1 from public.sprint_team_members stm
      where stm.sprint_id = sprint_id
        and stm.user_id = auth.uid()
    ))
  );
