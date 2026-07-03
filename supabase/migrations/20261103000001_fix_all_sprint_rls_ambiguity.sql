-- Fix all ambiguous sprint_id references in RLS policies
-- These policies were referencing sprint_id without table qualification

-- Fix sprint_teams_select policy
drop policy if exists "sprint_teams_select" on public.sprint_teams;
create policy "sprint_teams_select" on public.sprint_teams
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.is_sprint_member(public.sprint_teams.sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = public.sprint_teams.sprint_id and s.department_id is null
    )
  );

-- Fix sprint_members_select policy
drop policy if exists "sprint_members_select" on public.sprint_members;
create policy "sprint_members_select" on public.sprint_members
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or user_id = auth.uid()
    or public.is_sprint_member(public.sprint_members.sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = public.sprint_members.sprint_id and s.department_id is null
    )
  );

-- Fix sprint_reviews_select policy
drop policy if exists "sprint_reviews_select" on public.sprint_reviews;
create policy "sprint_reviews_select" on public.sprint_reviews
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.is_sprint_member(public.sprint_reviews.sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = public.sprint_reviews.sprint_id and s.department_id is null
    )
  );
