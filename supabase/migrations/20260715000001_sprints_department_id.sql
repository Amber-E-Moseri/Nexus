-- Ensure sprints.department_id exists.
-- The original DO block in 20260618000000 may have silently skipped this
-- if the column check returned an unexpected result.
alter table public.sprints
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists sprints_department_id_idx on public.sprints(department_id);
