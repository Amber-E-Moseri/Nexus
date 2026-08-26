-- Bug: sprint_teams_select only grants visibility via has_sprint_viewer_privilege() or
-- is_sprint_member(sprint_id) — and is_sprint_member() checks the separate sprint_members
-- (sprint-wide) table, not sprint_team_members (team-specific). A user added only to a
-- specific team (e.g. Accommodation, Secretariat and Planning, Finance) — the normal way
-- people get added to This Is It 2.0 teams — has no sprint_members row, so RLS returns zero
-- rows from sprint_teams for their own session even though their sprint_team_members row is
-- perfectly valid and visible to them directly. Every downstream access check that needs to
-- read sprint_teams to resolve "what team am I on" (RegistrationPage.jsx's checkAccess,
-- RegistrationEcosystem.jsx's rooms-access check) then sees an empty team list and denies
-- access outright, regardless of real team membership.
--
-- Confirmed via three real accounts (Sharon/Finance, Dorcas & Ella/Secretariat) whose
-- sprint_team_members rows were correct but who still got denied registration access.
--
-- Fix: also grant visibility into a team row when the caller has a sprint_team_members row
-- for that specific team. This doesn't expose anything a user couldn't already prove they're
-- entitled to see via sprint_team_members' own (already correct) SELECT policy — it just lets
-- the same fact be read from the other side of the relationship.

drop policy if exists "sprint_teams_select" on public.sprint_teams;
create policy "sprint_teams_select" on public.sprint_teams
  for select to authenticated
  using (
    public.has_sprint_viewer_privilege()
    or public.is_sprint_member(sprint_id)
    or exists (
      select 1
      from public.sprint_team_members stm
      where stm.team_id = sprint_teams.id
        and stm.user_id = auth.uid()
    )
  );
