-- Add 'group' to the space_type enum.
-- Group spaces are pastor-owned workspaces (tasks, lists, meetings) for a pastor
-- and their assigned members. Distinct from Flock CRM which tracks relationships.
-- Access: super_admin sees all; owner (pastor) sees their own; members see via visibility.

-- Drop the existing inline CHECK constraint (auto-named by Postgres)
alter table public.departments
  drop constraint if exists departments_space_type_check;

-- Re-add with 'group' included
alter table public.departments
  add constraint departments_space_type_check
  check (space_type in ('department', 'program', 'personal', 'sandbox', 'group'));
