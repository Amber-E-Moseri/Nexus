-- Restrictive visibility gate for event deliverable tasks.
-- Apply only after auditing the current tasks RLS policy set.

-- Visibility + update/delete: non-programs users can only see/edit their own deliverable tasks.
create policy "tasks_hide_deliverables_from_non_programs"
on public.tasks
as restrictive
for all
to authenticated
using (
  calendar_event_id is null
  or public.is_programs_team()
  or public.current_user_role() = 'super_admin'
  or assignee_id = auth.uid()
  or created_by = auth.uid()
);

-- INSERT-specific restriction: only programs team and super admins can create deliverable tasks.
-- created_by = auth.uid() cannot be used here — any user could satisfy it by setting their own UID.
create policy "tasks_deliverables_insert_programs_only"
on public.tasks
as restrictive
for insert
to authenticated
with check (
  calendar_event_id is null
  or public.is_programs_team()
  or public.current_user_role() = 'super_admin'
);
