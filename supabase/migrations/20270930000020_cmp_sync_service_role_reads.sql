-- cmp-documentation-sync authorizes non-admin callers by reading sprint team membership
-- with the service_role key (sprint_team_members -> sprint_teams -> sprints). Base grants
-- for service_role on these tables are not guaranteed after `supabase db reset`, which made
-- the function fail closed and deny legitimate ICPLC sprint-team writers.
-- Read-only; RLS is unchanged for authenticated callers.

GRANT SELECT ON public.sprint_team_members TO service_role;
GRANT SELECT ON public.sprint_teams TO service_role;
GRANT SELECT ON public.sprints TO service_role;
