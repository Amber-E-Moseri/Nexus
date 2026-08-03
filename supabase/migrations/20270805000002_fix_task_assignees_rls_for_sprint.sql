-- Fix: task_assignees RLS policy was blocking sprint team members from inserting/updating
-- because it only allowed dept_leads (which requires department_id to be non-null)
--
-- Add: allow sprint team members to update assignees for sprint tasks

drop policy if exists "task_assignees_write" on public.task_assignees;

create policy "task_assignees_write" on public.task_assignees
  for all using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (
          t.created_by = auth.uid()
          or public.current_user_role() in ('super_admin', 'regional_secretary')
          or (t.department_id is not null and public.has_space_role(auth.uid(), t.department_id, 'dept_lead'))
          or (t.sprint_id is not null and exists(
            select 1 from public.sprint_team_members stm
            where stm.sprint_id = t.sprint_id
              and stm.user_id = auth.uid()
          ))
        )
    )
  );
