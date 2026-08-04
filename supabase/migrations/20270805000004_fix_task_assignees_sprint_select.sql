-- task_assignees_select was blocking users from reading their own secondary-assignee
-- entries for custom sprint tasks (sprint_type = 'custom', department_id = null).
--
-- Root cause: the policy required one of:
--   - t.assignee_id = auth.uid()  (primary assignee only)
--   - t.created_by = auth.uid()
--   - t.department_id = current_user_department()  (fails when NULL)
--   - super_admin / regional_secretary
--
-- Multi-dept sprint tasks work because the sync_task_department_id() trigger
-- resolves a department_id from the assignee's team, so the dept clause passes.
-- Custom sprint tasks always have department_id = null by design, so no clause
-- matched for secondary assignees — their own task_assignees rows were invisible.
--
-- This caused useMyTasks to build an incomplete assignedTaskIds list, missing
-- multi-assignee custom sprint tasks even when the user was genuinely assigned.
--
-- Fix 1: Add `user_id = auth.uid()` as a trivial escape hatch — you can always
--   read your own task_assignees entries, regardless of task type.
-- Fix 2: Add sprint member clause so all sprint team members can see who else
--   is assigned to tasks in their sprint (needed for TaskModal assignee display).

drop policy if exists "task_assignees_select" on public.task_assignees;

create policy "task_assignees_select" on public.task_assignees
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.deleted_at is null
        and (
          t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or (t.is_personal = false and t.department_id = public.current_user_department())
          or public.current_user_role() in ('super_admin', 'regional_secretary')
          or (t.sprint_id is not null and public.is_sprint_member(t.sprint_id))
        )
    )
  );
