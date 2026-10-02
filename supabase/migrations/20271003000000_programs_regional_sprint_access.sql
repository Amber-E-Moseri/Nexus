-- Programs department members get write access to all regional sprints (ICPLC, TII, etc.)
-- They can see, create, edit, and delete tasks in any sprint without team membership.
--
-- IN-PLACE REPAIR (fix/programs-sprint-migration-ci): two syntax errors prevented fresh replay:
--
-- 1. try_cast(x as uuid) — not valid PostgreSQL syntax. Replaced with a CASE/regex guard that
--    preserves identical semantics: absent/empty/non-UUID setting → NULL (fails closed),
--    valid UUID string → cast. A forward-only migration cannot remedy a function body that
--    never compiled.
--
-- 2. ALTER POLICY "tasks_insert" ... USING (...) — tasks_insert is a FOR INSERT policy;
--    PostgreSQL rejects USING on INSERT-only policies (SQLSTATE 42601: "only WITH CHECK
--    expression allowed for INSERT"). Fixed by removing the USING clause. 20271003000001
--    drops and recreates this policy correctly as the final authoritative form.

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
          -- Safely cast session variable to uuid; returns NULL for absent/empty/invalid values
          case
            when current_setting('app.current_sprint_id', true)
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then current_setting('app.current_sprint_id', true)::uuid
            else null::uuid
          end
        )
          and stm.user_id = auth.uid()
      )
    )
  $$;

revoke execute on function public.can_write_sprint_tasks() from anon, public;
grant execute on function public.can_write_sprint_tasks() to authenticated;

-- Update tasks RLS: allow Programs to insert sprint tasks.
-- USING clause removed: tasks_insert is FOR INSERT; PostgreSQL disallows USING on INSERT
-- policies. 20271003000001 recreates this policy as its final authoritative form.
alter policy "tasks_insert" on public.tasks
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
