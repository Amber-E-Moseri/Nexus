-- Programs department members get write access to all regional sprints (ICPLC, TII, etc.)
-- They can see, create, edit, and delete tasks in any sprint without team membership.

create or replace function public.can_write_sprint_tasks()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      -- Super admin and regional secretary always have access
      public.current_user_role() in ('super_admin', 'regional_secretary')
      -- Programs department members have full access to all sprints
      or public.icplc_is_programs_member()
      -- Sprint team members can write based on team restrictions
      or exists (
        select 1
        from public.sprints s
        join public.sprint_teams st on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where s.id = (
          -- Get sprint_id from context (set via current_setting in the caller)
          try_cast(current_setting('app.current_sprint_id', true) as uuid)
        )
          and stm.user_id = auth.uid()
      )
    )
  $$;

revoke execute on function public.can_write_sprint_tasks() from anon, public;
grant execute on function public.can_write_sprint_tasks() to authenticated;

-- Update tasks RLS: allow Programs to insert/update/delete
alter policy "tasks_insert" on public.tasks
  using (
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
  )
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
