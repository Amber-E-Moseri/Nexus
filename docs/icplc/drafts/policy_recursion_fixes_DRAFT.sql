-- DRAFT / NOT A MIGRATION / NOT APPLIED ANYWHERE.
--
-- Policy-recursion fixes found while testing user-token access on a database built from the migration chain.
-- They are kept OUT of supabase/migrations on purpose: production's actual policies are unverified (read-only inspection was
-- not possible from this environment), and re-creating these policies from the chain's definitions could overwrite
-- production fixes. Verify production first, then turn the relevant parts into a migration.
--
-- Cycles found (every one is a policy A that queries table B whose policy queries table A):
--   1. sprint_teams.sprint_teams_select      -> sprint_team_members (EXISTS)   -> its policies -> sprint_teams
--   2. sprints.sprints_select                -> sprint_teams (EXISTS dept)     -> its policies -> sprints
--   3. departments.departments_select        -> group_space_members (EXISTS)   -> its policies -> departments
--   4. users.users_select_pastor_members     -> pastor_members                 -> pastor_members_select_scope -> users   (NOT fixed here)
-- 1-3 are fixed below with narrow SECURITY DEFINER predicate helpers (same predicate, evaluated without re-entering RLS).
-- With 1-3 applied a user-token read of sprint_teams / sprint_team_members still fails on the chain because of cycle 4
-- (users <-> pastor_members), which then also affects tasks and activity_log: a repo-wide problem, not ICPLC-specific.

create or replace function public.is_sprint_team_member(p_team_id uuid)
  returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
    select exists (select 1 from public.sprint_team_members stm where stm.team_id = p_team_id and stm.user_id = auth.uid())
  $$;
revoke execute on function public.is_sprint_team_member(uuid) from anon, public;
grant  execute on function public.is_sprint_team_member(uuid) to authenticated;

drop policy if exists "sprint_teams_select" on public.sprint_teams;
create policy "sprint_teams_select" on public.sprint_teams
  for select to authenticated
  using (
    public.has_sprint_viewer_privilege()
    or public.is_sprint_member(sprint_id)
    or public.is_sprint_team_member(id)
  );

create or replace function public.sprint_has_team_in_my_department(p_sprint_id uuid)
  returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
    select exists (
      select 1 from public.sprint_teams st
      where st.sprint_id = p_sprint_id and st.department_id = public.current_user_department()
    )
  $$;
revoke execute on function public.sprint_has_team_in_my_department(uuid) from anon, public;
grant  execute on function public.sprint_has_team_in_my_department(uuid) to authenticated;

drop policy if exists "sprints_select" on public.sprints;
create policy "sprints_select" on public.sprints
  for select to authenticated
  using (
    public.is_super_admin()
    or public.current_user_role() = 'regional_secretary'
    or public.is_programs_team()
    or created_by = auth.uid()
    or public.is_sprint_member(id)
    or (department_id is not null and department_id = public.current_user_department())
    or public.sprint_has_team_in_my_department(id)
  );


create or replace function public.is_group_space_owner(p_group_space_id uuid)
  returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
    select exists (
      select 1 from public.departments d
      where d.id = p_group_space_id and d.space_type = 'group' and d.owner_id = auth.uid()
    )
  $$;
revoke execute on function public.is_group_space_owner(uuid) from anon, public;
grant  execute on function public.is_group_space_owner(uuid) to authenticated;

drop policy if exists "group_space_members_insert" on public.group_space_members;
create policy "group_space_members_insert" on public.group_space_members
  for insert to authenticated
  with check (public.current_user_role() = 'super_admin' or public.is_group_space_owner(group_space_id));

drop policy if exists "group_space_members_delete" on public.group_space_members;
create policy "group_space_members_delete" on public.group_space_members
  for delete to authenticated
  using (public.current_user_role() = 'super_admin' or public.is_group_space_owner(group_space_id));

drop policy if exists "group_space_members_select" on public.group_space_members;
create policy "group_space_members_select" on public.group_space_members
  for select to authenticated
  using (public.current_user_role() = 'super_admin' or user_id = auth.uid() or public.is_group_space_owner(group_space_id));
