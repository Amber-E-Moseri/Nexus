-- tasks_delete (20270720000005) checks super_admin and has_space_role(dept_lead),
-- but omits regional_secretary, which tasks_insert/tasks_update already treat as
-- an org-wide role (see 20270719000008). Regional secretaries hit RLS violations
-- deleting tasks outside their home department. Add the role check to match.

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  );
