-- Keeps tasks created through a bulk assignment action distinct from ordinary
-- team work so boards can render them in their shared-task area.
alter table public.tasks
  add column if not exists is_bulk_assigned boolean not null default false;

create index if not exists tasks_bulk_assigned_sprint_idx
  on public.tasks (sprint_id)
  where is_bulk_assigned = true and deleted_at is null;
