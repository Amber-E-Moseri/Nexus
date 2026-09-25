-- Gap-fill: 20260619000002_sprint_teams_decoupling creates sprint_team_members
-- with schema (id, team_id, user_id, role, joined_at), but
-- 20260620000000_sprint_system_hardening expects (sprint_id, sprint_team_id, user_id)
-- with PRIMARY KEY (sprint_team_id, user_id).
-- The table is empty at this point, so drop it to let the next migration recreate
-- it with the correct schema.

drop table if exists public.sprint_team_members cascade;
