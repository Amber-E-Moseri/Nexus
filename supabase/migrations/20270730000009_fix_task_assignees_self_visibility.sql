-- Fix: users can see their own row in task_assignees even if they're from
-- a different department than the task. Without this, cross-department
-- @mention assignees couldn't read their own task_assignees row, making
-- them invisible in the ASSIGNEES section and getting wiped on next save.

drop policy if exists "task_assignees_select" on public.task_assignees;

create policy "task_assignees_select" on public.task_assignees
  for select
  to public
  using (
    task_assignees.user_id = auth.uid()
    or (
      select
        tm.deleted_at is null
        and (
          tm.assignee_id = auth.uid()
          or tm.created_by = auth.uid()
          or (tm.is_personal = false and tm.department_id = public.current_user_department())
          or public.current_user_role() = any (array['super_admin', 'regional_secretary'])
        )
      from public.task_meta(task_assignees.task_id) tm
    )
  );
