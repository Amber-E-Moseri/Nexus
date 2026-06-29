-- Adds the missing `active` boolean column to task_status_definitions.
-- listTaskStatuses() in taskStatuses.js filters on .eq('active', true)
-- and archiveTaskStatus() sets active: false for soft deletes.

alter table public.task_status_definitions
  add column if not exists active boolean not null default true;

-- Mark the existing seeded statuses as active
update public.task_status_definitions set active = true where active is null;
