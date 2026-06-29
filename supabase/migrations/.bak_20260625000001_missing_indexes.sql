create index if not exists tasks_sprint_id_idx
  on public.tasks (sprint_id);

create index if not exists tasks_created_at_desc_idx
  on public.tasks (created_at desc);

create index if not exists tasks_department_id_is_personal_false_idx
  on public.tasks (department_id, is_personal)
  where is_personal = false;

create index if not exists tasks_sprint_id_is_personal_false_idx
  on public.tasks (sprint_id, is_personal)
  where is_personal = false;

create index if not exists task_comments_task_id_idx
  on public.task_comments (task_id);
