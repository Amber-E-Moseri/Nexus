-- Board drag-and-drop (a tasks UPDATE — status_id/list_id/position) fails with
-- RLS violation 42501 for regional_secretary on any task they didn't create
-- and aren't dept_lead of. tasks_insert (20270719000008) and tasks_delete
-- (20270720000016) both already treat regional_secretary as an org-wide role
-- equivalent to super_admin, but tasks_update (last rebuilt in
-- 20270720000007) and the sprint-board equivalent
-- tasks_update_delete_sprint_manager (20260620000000/20260621000000) were
-- never updated to match — 20270720000016's own comment incorrectly assumed
-- tasks_update already had it. This is why drag-and-drop looks broken for
-- regional_secretary specifically but is really a missed role addition, not
-- an isolated account issue.

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  )
  with check (
    created_by = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  );

drop policy if exists "tasks_update_delete_sprint_manager" on public.tasks;
create policy "tasks_update_delete_sprint_manager" on public.tasks
  for all to authenticated
  using (
    task_type = 'sprint'
    and sprint_id is not null
    and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or created_by = auth.uid()
      or public.can_manage_sprint(sprint_id)
    )
  )
  with check (
    task_type = 'sprint'
    and sprint_id is not null
    and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or created_by = auth.uid()
      or public.can_manage_sprint(sprint_id)
    )
  );
