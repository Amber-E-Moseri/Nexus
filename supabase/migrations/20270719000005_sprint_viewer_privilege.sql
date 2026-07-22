-- Grant ors/programs space-role holders read access to sprint-gated tables.
-- Write access is unchanged — ors/programs holders remain view-only unless
-- they are actual sprint members with manager/lead role.
--
-- To roll back, apply the following in a new migration:
--   drop policy if exists "sprint_members_select" on public.sprint_members;
--   create policy "sprint_members_select" on public.sprint_members
--     for select to authenticated
--     using (public.current_user_role() = 'super_admin' or public.is_sprint_member(sprint_id));
--
--   drop policy if exists "sprint_teams_select" on public.sprint_teams;
--   create policy "sprint_teams_select" on public.sprint_teams
--     for select to authenticated
--     using (public.current_user_role() = 'super_admin' or public.is_sprint_member(sprint_id));
--
--   drop policy if exists "sprint_reviews_select" on public.sprint_reviews;
--   create policy "sprint_reviews_select" on public.sprint_reviews
--     for select to authenticated
--     using (public.current_user_role() = 'super_admin' or public.is_sprint_member(sprint_id));
--
--   drop policy if exists "tasks_select_sprint_member" on public.tasks;
--   create policy "tasks_select_sprint_member" on public.tasks
--     for select to authenticated
--     using (task_type = 'sprint' and sprint_id is not null and public.is_sprint_member(sprint_id));
--
--   drop function if exists public.has_sprint_viewer_privilege();

create or replace function public.has_sprint_viewer_privilege()
returns boolean
language sql
stable
as $$
  select (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or exists (
      select 1 from public.space_roles
      where user_id = auth.uid()
        and role in ('ors', 'programs')
    )
  )
$$;

-- Permissive policies — these OR with any existing SELECT grants.

drop policy if exists "sprint_members_select" on public.sprint_members;
create policy "sprint_members_select" on public.sprint_members
  for select to authenticated
  using (
    public.has_sprint_viewer_privilege()
    or public.is_sprint_member(sprint_id)
  );

drop policy if exists "sprint_teams_select" on public.sprint_teams;
create policy "sprint_teams_select" on public.sprint_teams
  for select to authenticated
  using (
    public.has_sprint_viewer_privilege()
    or public.is_sprint_member(sprint_id)
  );

drop policy if exists "sprint_reviews_select" on public.sprint_reviews;
create policy "sprint_reviews_select" on public.sprint_reviews
  for select to authenticated
  using (
    public.has_sprint_viewer_privilege()
    or public.is_sprint_member(sprint_id)
  );

-- tasks: sprint-type tasks readable by privileged viewers
drop policy if exists "tasks_select_sprint_member" on public.tasks;
create policy "tasks_select_sprint_member" on public.tasks
  for select to authenticated
  using (
    task_type = 'sprint'
    and sprint_id is not null
    and (
      public.is_sprint_member(sprint_id)
      or public.has_sprint_viewer_privilege()
    )
  );
