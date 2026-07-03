-- Fix ambiguous column reference in sprint_teams RLS policy
-- The policy was referencing sprint_id without table qualification,
-- causing issues when filtering by sprint_id in PostgREST queries

drop policy if exists "sprint_teams_select_space_access" on public.sprint_teams;

create policy "sprint_teams_select_space_access"
on public.sprint_teams
for select
to authenticated
using (
  sprint_id is null
  or exists (
    select 1
    from public.sprints s
    where s.id = public.sprint_teams.sprint_id
      and s.department_id is not null
      and public.can_view_space(s.department_id)
  )
);

-- Also fix sprint_members policy which has the same issue
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
