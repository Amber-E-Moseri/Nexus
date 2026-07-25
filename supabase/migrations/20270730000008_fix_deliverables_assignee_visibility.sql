-- Fix: grant deliverable task visibility to multi-assignees via task_assignees
-- The tasks_hide_deliverables_from_non_programs RESTRICTIVE policy was only checking
-- the single assignee_id column, not the multi-assignee task_assignees table.
-- Users added via @mention (in task_assignees) couldn't see calendar deliverable tasks.

drop policy if exists "tasks_hide_deliverables_from_non_programs" on public.tasks;

create policy "tasks_hide_deliverables_from_non_programs" on public.tasks
  as restrictive
  for all
  to authenticated
  using (
    calendar_event_id is null
    or public.is_programs_team()
    or public.current_user_role() = 'super_admin'
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or public.is_task_assignee(id, auth.uid())
  );
