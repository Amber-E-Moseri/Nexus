-- Allow regional_secretary to create deliverable tasks (tasks with calendar_event_id set).
-- Uses ALTER POLICY (not drop/create) because we're replacing WITH CHECK wholesale;
-- no OR-clause append is needed, so there's no justification for the brief coverage
-- gap that drop/create introduces mid-migration.
alter policy "tasks_deliverables_insert_programs_only" on public.tasks
  with check (
    calendar_event_id is null
    or public.is_programs_team()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
  );
