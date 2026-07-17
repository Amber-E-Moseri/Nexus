-- Add recurrence settings to tasks
alter table public.tasks
  add column if not exists recurrence jsonb;

comment on column public.tasks.recurrence is
  'Recurring task config: { frequency, trigger, create_new_task, recur_forever, update_status_to, sync_to_due_date }';
