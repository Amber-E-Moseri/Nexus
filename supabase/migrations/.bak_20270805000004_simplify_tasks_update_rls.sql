-- Simplify: tasks_update RLS policy was too complex and still blocking updates
-- Try a more straightforward approach: super_admin can update any task
-- Regular users: creator or dept_lead or sprint_team_member

drop policy if exists "tasks_update" on public.tasks;

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
    or (department_id is not null and public.has_space_role(auth.uid(), department_id, 'dept_lead'))
    or (sprint_id is not null and exists(
      select 1 from public.sprint_team_members stm
      where stm.sprint_id = tasks.sprint_id
        and stm.user_id = auth.uid()
    ))
  )
  with check (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
    or (department_id is not null and public.has_space_role(auth.uid(), department_id, 'dept_lead'))
    or (sprint_id is not null and exists(
      select 1 from public.sprint_team_members stm
      where stm.sprint_id = tasks.sprint_id
        and stm.user_id = auth.uid()
    ))
  );
