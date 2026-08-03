-- Restore the real tasks_update policy after the RLS debug pass (20270805000005)
-- and drop the two throwaway diagnostic functions.
--
-- The cross-team sprint bug was never RLS: TaskModal's auto-select effect
-- overwrote an existing task's sprint_team_id with the viewer's own team on
-- open, so the picker always showed the wrong team and saved it back.

drop function if exists public.test_update_sprint_team_id(uuid, uuid);
drop function if exists public.diagnostic_prayer_plan();

drop policy if exists "tasks_update" on public.tasks;

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
    or (department_id is not null and public.has_space_role(auth.uid(), department_id, 'dept_lead'))
    or (sprint_id is not null and exists(
      select 1 from public.sprint_team_members stm
      join public.sprint_teams st on st.id = stm.team_id
      where st.sprint_id = tasks.sprint_id
        and stm.user_id = auth.uid()
    ))
  )
  with check (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
    or (department_id is not null and public.has_space_role(auth.uid(), department_id, 'dept_lead'))
    or (sprint_id is not null and exists(
      select 1 from public.sprint_team_members stm
      join public.sprint_teams st on st.id = stm.team_id
      where st.sprint_id = tasks.sprint_id
        and stm.user_id = auth.uid()
    ))
  );
