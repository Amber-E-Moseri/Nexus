-- sprint_team_members is missing role and joined_at columns.
-- These were intended from the original schema (20260619000002 / 20260620000000)
-- but were dropped during a re-creation or column-normalisation migration.
-- Without them, getTeamDetail / addTeamMember / SprintMemberPanel all fail
-- with "column sprint_team_members.role does not exist".

alter table public.sprint_team_members
  add column if not exists role      text,
  add column if not exists joined_at timestamptz not null default now();
