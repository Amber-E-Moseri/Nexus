-- Fix: activity_log_select_scope only allowed users to see their own entries.
-- Task activity tab needs to show ALL actions on a task (by any user) as long
-- as the viewer has access to that task. Add a second PERMISSIVE policy that
-- opens task-entity rows to anyone who can see the task.

create policy "activity_log_select_task_entity"
on public.activity_log
for select
to authenticated
using (
  entity_type = 'task'
  and exists (
    select 1 from public.tasks t
    where t.id = activity_log.entity_id
      and t.deleted_at is null
      and (
        t.created_by          = auth.uid()
        or t.assignee_id      = auth.uid()
        or public.is_task_assignee(t.id, auth.uid())
        or public.current_user_role() in ('super_admin', 'regional_secretary')
        or (
          t.is_personal = false
          and (
            t.department_id = public.current_user_department()
            or (
              t.department_id is null
              and t.parent_task_id is not null
              and exists (
                select 1 from public.tasks pt
                where pt.id = t.parent_task_id
                  and pt.department_id = public.current_user_department()
              )
            )
          )
        )
      )
  )
);
