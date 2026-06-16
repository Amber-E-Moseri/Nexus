create index if not exists tasks_department_id_idx
  on public.tasks(department_id);

create index if not exists tasks_assignee_id_idx
  on public.tasks(assignee_id);

create index if not exists tasks_is_personal_idx
  on public.tasks(is_personal);

create index if not exists tasks_parent_task_id_idx
  on public.tasks(parent_task_id);
