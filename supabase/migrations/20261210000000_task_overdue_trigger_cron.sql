-- ============================================================
-- TASK OVERDUE TRIGGER CRON JOB
-- Scheduled edge function that runs hourly to check for overdue tasks
-- and trigger automation rules (e.g., escalate to lead)
-- ============================================================

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Schedule task overdue trigger ───────────────────────
-- Fires every hour at :00 minutes
-- Checks all tasks with due_date < today and triggers matching automations

SELECT cron.schedule(
  'task-overdue-trigger-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/task-overdue-trigger',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ─── Manual Testing ──────────────────────────────────────
-- To manually trigger for testing, run:
-- SELECT net.http_post(
--   url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/task-overdue-trigger',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--     'Content-Type', 'application/json'
--   ),
--   body := '{}'::jsonb
-- );
--
-- To view/stop cron jobs:
-- SELECT * FROM cron.job;
-- SELECT cron.unschedule('task-overdue-trigger-hourly');
