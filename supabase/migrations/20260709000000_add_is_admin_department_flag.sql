-- =============================================================================
-- Add durable is_admin flag to departments table
-- =============================================================================
-- Following the same pattern as is_programs (20260930000002):
-- - Add boolean column with default false
-- - Create unique index to enforce single Admin department
-- - Update the existing Admin department row to is_admin = true
--
-- This allows stable identification of the Admin department without relying on
-- name-string matching (which breaks silently on rename).

alter table public.departments
  add column if not exists is_admin boolean not null default false;

update public.departments
set is_admin = true
where name ilike '%admin%';

create unique index if not exists departments_one_admin_space_idx
  on public.departments (is_admin)
  where is_admin = true;
