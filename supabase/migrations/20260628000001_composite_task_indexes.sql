create index if not exists tasks_dept_list_idx
  on public.tasks (department_id, created_at desc)
  where is_personal = false and parent_task_id is null;

comment on index public.tasks_dept_list_idx is
  'Backs getDeptTasks() WHERE department_id = ? AND is_personal = false AND parent_task_id IS NULL ORDER BY created_at DESC';

create index if not exists tasks_sprint_list_idx
  on public.tasks (sprint_id, created_at desc)
  where task_type = 'sprint' and parent_task_id is null;

comment on index public.tasks_sprint_list_idx is
  'Backs getSprintTasks() WHERE sprint_id = ? AND task_type = ''sprint'' AND parent_task_id IS NULL ORDER BY created_at DESC';
