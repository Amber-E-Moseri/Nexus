-- Add sprint_team_id column to tasks to track which sprint team owns a sprint task.
-- This is separate from department_id (which is null for sprint tasks).
-- Allows tasks to be assigned to specific teams within a multi-team sprint while
-- remaining visible to all teams via RLS (which checks sprint_id, not department_id).

alter table public.tasks
  add column if not exists sprint_team_id uuid references public.sprint_teams(id) on delete set null;

create index if not exists tasks_sprint_team_id_idx on public.tasks (sprint_team_id) where sprint_team_id is not null;
