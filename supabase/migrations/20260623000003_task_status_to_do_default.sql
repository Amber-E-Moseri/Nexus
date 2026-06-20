-- Replace 'Not Started' with 'To Do' as the default task status

-- Create 'To Do' status globally if it doesn't exist
insert into public.task_status_definitions (name, color, category, department_id, sort_order, is_default, active, legacy_key)
select 'To Do', '#378ADD', 'open', null, 0, true, true, 'to_do'
where not exists (
  select 1 from public.task_status_definitions
  where name = 'To Do' and department_id is null
);

-- Set 'To Do' as default globally
update public.task_status_definitions
set is_default = true, sort_order = 0
where name = 'To Do' and department_id is null;

-- Remove 'Not Started' as default globally
update public.task_status_definitions
set is_default = false
where name = 'Not Started' and department_id is null;

-- Create 'To Do' status per department if it doesn't exist
insert into public.task_status_definitions (name, color, category, department_id, sort_order, is_default, active, legacy_key)
select 'To Do', '#378ADD', 'open', departments.id, 0, true, true, 'to_do'
from public.departments
where not exists (
  select 1 from public.task_status_definitions
  where name = 'To Do' and department_id = departments.id
);

-- Set 'To Do' as default per department
update public.task_status_definitions
set is_default = true, sort_order = 0
where name = 'To Do' and department_id is not null;

-- Remove 'Not Started' as default per department
update public.task_status_definitions
set is_default = false
where name = 'Not Started' and department_id is not null;
