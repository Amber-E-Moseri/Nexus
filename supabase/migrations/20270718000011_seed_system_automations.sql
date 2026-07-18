-- Seed 3 org-wide preset notification automations.
-- Guarded with WHERE NOT EXISTS so re-runs are safe.
-- Excludes "notify on assignment" and "notify on completion" — those fire via direct
-- create_task_notification RPC calls in the UI and must not be duplicated here.

insert into public.automations (name, description, trigger_type, trigger_config, conditions, actions, department_id, enabled)
select
  'Notify on overdue task',
  'Send a notification to the assignee when a task becomes overdue',
  'task_overdue', '{}', '[]',
  '[{"type":"send_notification","config":{"user_id":"assigned_to","message":"Task ''{{task_title}}'' is overdue."}}]',
  null, true
where not exists (
  select 1 from public.automations where name = 'Notify on overdue task' and department_id is null
);

insert into public.automations (name, description, trigger_type, trigger_config, conditions, actions, department_id, enabled)
select
  'Notify assignee on comment',
  'Notify the task assignee when a new comment is added (skips self-notification)',
  'comment_added', '{}', '[]',
  '[{"type":"send_notification","config":{"user_id":"assigned_to","message":"A comment was added to ''{{task_title}}''.","skip_self_notify":true}}]',
  null, true
where not exists (
  select 1 from public.automations where name = 'Notify assignee on comment' and department_id is null
);

insert into public.automations (name, description, trigger_type, trigger_config, conditions, actions, department_id, enabled)
select
  'Delegated task due soon reminder',
  'Notify the task creator when a delegated task is due within 24 hours',
  'delegated_task_due_soon', '{}', '[]',
  '[{"type":"send_notification","config":{"user_id":"created_by","message":"A task you delegated, ''{{task_title}}'', is due within 24 hours."}}]',
  null, true
where not exists (
  select 1 from public.automations where name = 'Delegated task due soon reminder' and department_id is null
);
