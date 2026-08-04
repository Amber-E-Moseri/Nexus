-- Fix cron.schedule() syntax errors from 20260803
-- The original migration used invalid ON CONFLICT DO NOTHING syntax.
-- This re-schedules the jobs with correct DO block unschedule pattern.

-- Re-schedule weekly-recap-email — every Monday at 13:00 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('weekly-recap-email');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'weekly-recap-email',
  '0 13 * * 1',
  $$
  SELECT net.http_post(
    url       := (SELECT current_setting('app.supabase_url')) || '/functions/v1/weekly-recap-email',
    headers   := jsonb_build_object(
                   'Authorization', 'Bearer ' || (SELECT current_setting('app.service_role_key')),
                   'Content-Type',  'application/json'
                 ),
    body      := '{}'::jsonb
  );
  $$
);

-- Re-schedule reengagement-email — every day at 14:00 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('reengagement-email');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'reengagement-email',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url       := (SELECT current_setting('app.supabase_url')) || '/functions/v1/reengagement-email',
    headers   := jsonb_build_object(
                   'Authorization', 'Bearer ' || (SELECT current_setting('app.service_role_key')),
                   'Content-Type',  'application/json'
                 ),
    body      := '{}'::jsonb
  );
  $$
);
