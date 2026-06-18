-- ============================================================
-- FIX: ORG-WIDE SPRINT RLS POLICIES FOR RELATED TABLES
-- ============================================================
-- Ensure sprint_teams, sprint_members, and sprint_reviews
-- are readable for org-wide sprints (department_id IS NULL)

-- Fix sprint_teams_select to allow org-wide access
drop policy if exists "sprint_teams_select" on public.sprint_teams;
create policy "sprint_teams_select" on public.sprint_teams
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.is_sprint_member(sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = sprint_id and s.department_id is null
    )
  );

-- Fix sprint_members_select to allow viewing org-wide sprint members
drop policy if exists "sprint_members_select" on public.sprint_members;
create policy "sprint_members_select" on public.sprint_members
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or user_id = auth.uid()
    or public.is_sprint_member(sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = sprint_id and s.department_id is null
    )
  );

-- Fix sprint_reviews_select to allow org-wide access
drop policy if exists "sprint_reviews_select" on public.sprint_reviews;
create policy "sprint_reviews_select" on public.sprint_reviews
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.is_sprint_member(sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = sprint_id and s.department_id is null
    )
  );
