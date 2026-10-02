-- Programs department members get write access to all regional sprints (ICPLC, TII, etc.)
-- They can see, create, edit, and delete tasks in any sprint without team membership.

-- Update existing tasks RLS policy to allow Programs write access
do $$
declare
  policy_exists boolean;
begin
  -- Check if the policy exists
  select exists(
    select 1 from pg_policies where tablename = 'tasks' and policyname = 'tasks_insert'
  ) into policy_exists;

  if policy_exists then
    drop policy "tasks_insert" on public.tasks;
  end if;

  -- Create new policy that allows Programs members to write
  create policy "tasks_insert" on public.tasks
    for insert
    with check (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.sprints s
        join public.sprint_teams st on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where s.id = tasks.sprint_id
          and stm.user_id = auth.uid()
      )
    );
end $$;
