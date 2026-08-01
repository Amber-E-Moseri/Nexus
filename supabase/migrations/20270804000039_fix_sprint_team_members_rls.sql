-- Fix sprint_team_members_select policy: sprint_team_members has no sprint_id column
-- (it has team_id → sprint_teams.sprint_id). Replace direct sprint_id refs with a subquery.

drop policy if exists "sprint_team_members_select" on public.sprint_team_members;
create policy "sprint_team_members_select" on public.sprint_team_members
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or exists (
      select 1
      from public.sprint_teams st
      where st.id = sprint_team_members.team_id
        and (
          public.is_sprint_member(st.sprint_id)
          or exists (
            select 1
            from public.sprints s
            where s.id = st.sprint_id
              and s.department_id is not null
              and public.can_view_space(s.department_id)
          )
        )
    )
  );
