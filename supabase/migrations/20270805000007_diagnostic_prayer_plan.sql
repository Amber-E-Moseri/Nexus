-- DEBUG (dropped in 20270805000008): read-back probe for a single task row.
-- Kept for faithful replay.

create or replace function public.diagnostic_prayer_plan()
returns table(
  task_id uuid,
  title text,
  sprint_id uuid,
  sprint_team_id uuid,
  department_id uuid
)
language sql
stable
as $$
  select id, title, sprint_id, sprint_team_id, department_id
  from public.tasks
  where title = 'Prayer Plan'
  limit 1;
$$;
