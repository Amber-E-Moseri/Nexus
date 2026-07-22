-- ============================================================
-- RECURRING MEETINGS GENERATION CRON JOB
-- Scheduled edge function that runs hourly to progressively materialize
-- the next occurrence of each recurring meeting series (~1 day ahead),
-- instead of creating every occurrence up front at schedule time.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule() returns a bigint job id via a plain SELECT — it's not an
-- INSERT, so ON CONFLICT can't attach to it. Unschedule any prior job with
-- this name first instead, so the migration stays safe to re-run.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generate-recurring-meetings-hourly';

SELECT cron.schedule(
  'generate-recurring-meetings-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/generate-recurring-meetings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Manual test trigger:
-- SELECT net.http_post(
--   url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/generate-recurring-meetings',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--     'Content-Type', 'application/json'
--   ),
--   body := '{}'::jsonb
-- );
