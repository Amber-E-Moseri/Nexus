-- Creates the task_status_definitions table that taskStatuses.js expects.
-- The tasks table keeps its plain `status` text column for backward compat;
-- the existing sync_task_status_fields trigger (20260618000001) keeps them in sync.

create table if not exists public.task_status_definitions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  color         text not null default '#B0A696',
  category      text not null check (category in ('open','in_progress','completed','cancelled')),
  department_id uuid references public.departments(id) on delete cascade,
  sort_order    integer not null default 0,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Global default statuses (department_id null = available to all)
insert into public.task_status_definitions
  (name, color, category, department_id, sort_order)
values
  ('To Do',       '#B0A696', 'open',         null, 1),
  ('In Progress', '#1E40AF', 'in_progress',  null, 2),
  ('In Review',   '#C47E0A', 'in_progress',  null, 3),
  ('Done',        '#2D8653', 'completed',    null, 4),
  ('Blocked',     '#C94830', 'open',         null, 5),
  ('Cancelled',   '#7A6F5E', 'cancelled',    null, 6)
on conflict do nothing;

-- RLS
alter table public.task_status_definitions enable row level security;

drop policy if exists "status_definitions_select_authenticated" on public.task_status_definitions;
create policy "status_definitions_select_authenticated"
on public.task_status_definitions for select to authenticated
using (true);

drop policy if exists "status_definitions_manage_admin" on public.task_status_definitions;
create policy "status_definitions_manage_admin"
on public.task_status_definitions for all to authenticated
using (
  current_user_role() = 'super_admin' or
  (current_user_role() = 'dept_lead' and
   (department_id is null or department_id = current_user_department()))
)
with check (
  current_user_role() = 'super_admin' or
  (current_user_role() = 'dept_lead' and
   (department_id is null or department_id = current_user_department()))
);

-- Index for department-scoped lookups
create index if not exists task_status_definitions_dept_idx
  on public.task_status_definitions(department_id);

create index if not exists task_status_definitions_category_idx
  on public.task_status_definitions(category);
