-- Fully qualify all sprint_id references in RLS policies to prevent ambiguity
-- The issue is that sprint_id appears in multiple tables (sprint_teams, sprint_members, sprints)
-- and PostgreSQL needs explicit table qualification to resolve which one to use

drop policy if exists "sprint_teams_select_space_access" on public.sprint_teams;

create policy "sprint_teams_select_space_access"
on public.sprint_teams
for select
to authenticated
using (
  public.sprint_teams.sprint_id is null
  or exists (
    select 1
    from public.sprints s
    where s.id = public.sprint_teams.sprint_id
      and s.department_id is not null
      and public.can_view_space(s.department_id)
  )
);

drop policy if exists "sprint_members_select_space_access" on public.sprint_members;

create policy "sprint_members_select_space_access"
on public.sprint_members
for select
to authenticated
using (
  exists (
    select 1
    from public.sprints s
    where s.id = public.sprint_members.sprint_id
      and s.department_id is not null
      and public.can_view_space(s.department_id)
  )
);

-- Also update any other policies in sprint_teams and sprint_members that may have ambiguous references
drop policy if exists "sprint_teams_insert_policy" on public.sprint_teams;

create policy "sprint_teams_insert_policy"
on public.sprint_teams
for insert
to authenticated
with check (
  exists (
    select 1
    from public.sprints s
    where s.id = public.sprint_teams.sprint_id
      and (s.department_id is null or public.can_view_space(s.department_id))
  )
);

drop policy if exists "sprint_teams_update_policy" on public.sprint_teams;

create policy "sprint_teams_update_policy"
on public.sprint_teams
for update
to authenticated
using (
  exists (
    select 1
    from public.sprints s
    where s.id = public.sprint_teams.sprint_id
      and (s.department_id is null or public.can_view_space(s.department_id))
  )
);

drop policy if exists "sprint_teams_delete_policy" on public.sprint_teams;

create policy "sprint_teams_delete_policy"
on public.sprint_teams
for delete
to authenticated
using (
  exists (
    select 1
    from public.sprints s
    where s.id = public.sprint_teams.sprint_id
      and (s.department_id is null or public.can_view_space(s.department_id))
  )
);
