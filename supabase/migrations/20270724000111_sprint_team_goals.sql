-- =============================================================================
-- Per-team sprint goals
-- -----------------------------------------------------------------------------
-- goals.sprint_id already scopes a goal to a whole sprint, but there was no
-- way to scope one to a single team within a multi-team sprint — every goal
-- was necessarily collective across all teams. Adds an optional
-- sprint_team_id: null means "collective, whole-sprint goal" (existing
-- behavior, unchanged); set means "this team's goal specifically".
-- Nullable and additive — no existing rows or RLS policies need to change.
-- =============================================================================

alter table public.goals
  add column if not exists sprint_team_id uuid references public.sprint_teams(id) on delete set null;

create index if not exists goals_sprint_team_id_idx on public.goals (sprint_team_id) where sprint_team_id is not null;
