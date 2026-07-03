-- Add sprint_id column to goals table to link goals to sprints
alter table public.goals
add column sprint_id uuid references public.sprints(id) on delete cascade;

-- Create index for faster lookups
create index idx_goals_sprint_id on public.goals(sprint_id);

-- Add comment for clarity
comment on column public.goals.sprint_id is 'Optional reference to a sprint. Goals can be either department-level (sprint_id IS NULL) or sprint-specific (sprint_id IS NOT NULL)';
