-- ============================================================
-- AUTOMATION ENGINE EXPANSION
-- Adds columns/tables needed by new automation trigger + action
-- types: task_created, task_moved_list, date_changed,
-- assignee_removed, comment_added, task_inactive.
-- ============================================================

-- ─── tasks: columns needed by new triggers/actions ───────────
-- start_date is set by the task_status_change -> In Progress
-- automation ("assign to creator, set start date to today").
alter table public.tasks
  add column if not exists start_date date;

-- updated_at drives the task_inactive trigger (N days since last
-- activity) the same way due_date already drives task_overdue.
alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.set_tasks_updated_at();

create index if not exists tasks_updated_at_idx on public.tasks (updated_at);

-- ─── task_dependencies ────────────────────────────────────────
-- The table, RLS, and picker UI (TaskDependencies.jsx) already exist
-- (20260613000000_task_maturity.sql: task_id, depends_on_id, type).
-- The date_changed -> shift_dependent_dates automation (#13) reuses
-- that table as-is: when depends_on_id's date moves, every task_id
-- row pointing at it shifts by the same delta. No schema change
-- needed here.

-- ─── task-inactive-trigger cron ───────────────────────────────
-- Mirrors task-overdue-trigger-hourly: a scheduled edge function
-- checks for tasks with no activity in N days and fires the
-- automation engine's task_inactive trigger. Runs less often than
-- the overdue check since inactivity is a daily-granularity signal.
select cron.schedule(
  'task-inactive-trigger-daily',
  '30 6 * * *',
  $$
  select net.http_post(
    url := (select current_setting('app.supabase_url')) || '/functions/v1/task-inactive-trigger',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To view/stop:
-- select * from cron.job;
-- select cron.unschedule('task-inactive-trigger-daily');

/*
DATABASE WEBHOOK SETUP INSTRUCTIONS (additions)
================================================
Add these alongside the webhooks already documented in
20260805000001_automation_triggers.sql — same target URL/headers,
different table/event/payload template.

4. Name: automation-task-created
   Table: tasks
   Events: INSERT
   Payload template:
   {
     "trigger_type": "task_created",
     "record": {{new}}
   }

5. Name: automation-task-moved-list
   Table: tasks
   Events: UPDATE
   Payload template:
   {
     "trigger_type": "task_moved_list",
     "new_record": {{new}},
     "old_record": {{old}}
   }

6. Name: automation-date-changed
   Table: tasks
   Events: UPDATE
   Payload template:
   {
     "trigger_type": "date_changed",
     "new_record": {{new}},
     "old_record": {{old}}
   }

7. Name: automation-assignee-removed
   Table: tasks
   Events: UPDATE
   Payload template:
   {
     "trigger_type": "assignee_removed",
     "new_record": {{new}},
     "old_record": {{old}}
   }

8. Name: automation-comment-added
   Table: task_comments
   Events: INSERT
   Payload template:
   {
     "trigger_type": "comment_added",
     "record": {{new}}
   }

Note: task_moved_list, date_changed and assignee_removed all fire off
tasks UPDATE alongside the existing task_status_change/task_assigned
webhooks — Supabase allows multiple webhooks on the same table/event,
and the automation-engine function itself filters by whether the
relevant field actually changed (see evaluateTriggerConditions).
*/
