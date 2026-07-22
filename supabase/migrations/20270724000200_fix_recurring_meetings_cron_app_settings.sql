-- ============================================================
-- FIX: RECURRING MEETINGS CRON — USE app_settings, NOT current_setting()
--
-- The original job (20270723000003) called current_setting('app.supabase_url')
-- directly inside the cron body. That GUC only exists if someone runs
-- `ALTER DATABASE ... SET app.supabase_url = ...`, which requires superuser
-- and hosted Supabase does not grant to migrations — so every run failed
-- with "unrecognized configuration parameter" (confirmed via
-- cron.job_run_details). The rest of this app's cron jobs that actually work
-- (see fire_scheduled_campaigns in 20260722000000_scheduled_sends.sql) read
-- from a `public.app_settings` config table via a SECURITY DEFINER helper
-- instead. This migration re-registers the job using that same pattern.
--
-- NOTE: app_settings currently has no 'supabase_url' / 'service_role_key'
-- rows at all (checked directly against production) — that is a
-- pre-existing gap affecting every cron-driven edge function in this app,
-- not something this migration can fix by itself. Someone with the service
-- role key must run, once:
--   insert into public.app_settings (key, value) values
--     ('supabase_url', 'https://<project-ref>.supabase.co'),
--     ('service_role_key', '<service-role-key>')
--   on conflict (key) do update set value = excluded.value;
-- Until then this job (and due-date-reminders, task-overdue-trigger, etc.)
-- will keep logging "app_settings not configured; skipping" and no-op.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

CREATE OR REPLACE FUNCTION public.generate_recurring_meetings_trigger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
BEGIN
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE LOG 'generate_recurring_meetings_trigger: app_settings not configured; skipping';
    RETURN;
  END IF;

  PERFORM http_post(
    url          := v_url || '/functions/v1/generate-recurring-meetings',
    body         := '{}',
    content_type := 'application/json',
    headers      := ARRAY[http_header('Authorization', 'Bearer ' || v_key)]
  );
END;
$$;

-- Replace the broken job registered by 20270723000003 with one that calls
-- the wrapper function above instead of embedding current_setting() calls.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generate-recurring-meetings-hourly';

SELECT cron.schedule(
  'generate-recurring-meetings-hourly',
  '0 * * * *',
  'select public.generate_recurring_meetings_trigger()'
);

-- Manual test trigger:
-- SELECT public.generate_recurring_meetings_trigger();
