-- Allow sprint members (temporary or not) to access sprint tasks
-- even if they don't have a department_id assignment.
--
-- tasks_select_sprint_member (added in early migrations, last modified by
-- 20270731000000) already grants SELECT to any is_sprint_member(sprint_id),
-- so sprint-task visibility is covered independently. This migration adds the
-- same sprint-member clause to tasks_select_member as belt-and-suspenders,
-- while preserving the deleted_at filter and meeting-privacy gate that the
-- initial draft of this migration (20270804) accidentally dropped.

alter policy "tasks_select_member" on public.tasks
  using (
    deleted_at is null
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or (
        is_personal = false
        and department_id = public.current_user_department()
        and (
          meeting_id is null
          or exists (
            select 1 from public.meetings m
            where m.id = tasks.meeting_id
              and (
                m.visibility = 'published'
                or m.created_by = auth.uid()
                or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
                or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
                or public.current_user_role() = any (array['super_admin','regional_secretary'])
              )
          )
        )
      )
      or (
        task_type = 'sprint'
        and sprint_id is not null
        and public.is_sprint_member(sprint_id)
      )
    )
  );
