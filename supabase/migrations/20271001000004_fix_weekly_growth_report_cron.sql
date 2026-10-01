-- Fix weekly-growth-report cron job.
--
-- ROOT CAUSE: 20270804000048 used current_setting('app.supabase_url'), a
-- PostgreSQL GUC that hosted Supabase never populates (superuser-only ALTER
-- DATABASE is not available from migrations). Every Sunday the cron SQL threw
-- "unrecognized configuration parameter" and silently no-op'd.
--
-- FIX:
--   1. Wrap the http_post in SECURITY DEFINER functions that read from the
--      app_settings table — the same pattern used by fire_scheduled_campaigns,
--      generate_recurring_meetings_trigger, and every other working cron here.
--   2. Authenticate with CRON_SHARED_SECRET (stored in app_settings as
--      'recurring_meetings_cron_secret') instead of the service_role key, which
--      resolves the legacy/opaque key format mismatch described in
--      20270724000204_recurring_meetings_cron_dedicated_secret.sql.
--      The edge functions were updated in the same deploy to accept
--      CRON_SHARED_SECRET alongside SUPABASE_SERVICE_ROLE_KEY.
--      service_role_key IS still sent as the `apikey` header — the Supabase
--      Edge Functions gateway requires it for admission; it is not used for
--      function-level authorization.
--
-- DST STRATEGY:
--   pg_cron on Supabase runs in UTC; cron expressions cannot encode timezone
--   awareness natively. A fixed UTC offset causes a 1-hour seasonal drift when
--   North America transitions between EDT (UTC-4) and EST (UTC-5).
--
--   Solution: schedule TWO candidate firings per job, one for each offset, and
--   add a wall-clock guard in each wrapper that checks the current
--   America/Toronto time. The guard window is ±3 minutes (6 minutes wide).
--   EDT and EST candidates are always 60 minutes apart, so only one candidate
--   can land inside the 6-minute window for any given week — even across the
--   DST boundary. This prevents double sends.
--
-- CANONICAL SCHEDULE (Eastern Time):
--   Sunday   8:50 PM ET — growth data sync
--   Sunday   9:00 PM ET — weekly report email
--   Monday   9:00 AM ET — catch-up sync (late Sunday submissions)
--
-- REQUIRED app_settings ROWS (must be present before running cron jobs):
--   supabase_url                 — https://[ref].supabase.co
--   service_role_key             — legacy-format key (for Edge Functions gateway)
--   recurring_meetings_cron_secret — equals CRON_SHARED_SECRET env var

-- ── Helpers ───────────────────────────────────────────────────────────────────

-- Checks whether the current America/Toronto wall-clock time is Sunday between
-- 8:47 PM and 8:53 PM (±3 minutes around 8:50 PM).
CREATE OR REPLACE FUNCTION public.growth_sync_in_window()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    extract(dow  from now() AT TIME ZONE 'America/Toronto')::int = 0  -- Sunday
    AND (
      extract(hour   from now() AT TIME ZONE 'America/Toronto')::int * 60
      + extract(minute from now() AT TIME ZONE 'America/Toronto')::int
    ) BETWEEN 1247 AND 1253  -- 8:47 PM – 8:53 PM = minutes 1247–1253
$$;

-- Checks whether the current America/Toronto wall-clock time is Sunday between
-- 8:57 PM and 9:03 PM (±3 minutes around 9:00 PM).
CREATE OR REPLACE FUNCTION public.growth_report_in_window()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    extract(dow  from now() AT TIME ZONE 'America/Toronto')::int = 0  -- Sunday
    AND (
      extract(hour   from now() AT TIME ZONE 'America/Toronto')::int * 60
      + extract(minute from now() AT TIME ZONE 'America/Toronto')::int
    ) BETWEEN 1257 AND 1263  -- 8:57 PM – 9:03 PM = minutes 1257–1263
$$;

-- Checks whether the current America/Toronto wall-clock time is Monday between
-- 8:57 AM and 9:03 AM (±3 minutes around 9:00 AM).
CREATE OR REPLACE FUNCTION public.growth_catchup_in_window()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    extract(dow  from now() AT TIME ZONE 'America/Toronto')::int = 1  -- Monday
    AND (
      extract(hour   from now() AT TIME ZONE 'America/Toronto')::int * 60
      + extract(minute from now() AT TIME ZONE 'America/Toronto')::int
    ) BETWEEN 537 AND 543  -- 8:57 AM – 9:03 AM = minutes 537–543
$$;

-- ── Cron wrappers ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_growth_reports_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_secret text := public.app_setting('recurring_meetings_cron_secret');
BEGIN
  IF v_url IS NULL OR v_apikey IS NULL OR v_secret IS NULL THEN
    RAISE LOG 'trigger_growth_reports_sync: app_settings not configured; skipping';
    RETURN;
  END IF;

  IF NOT public.growth_sync_in_window() THEN
    RAISE LOG 'trigger_growth_reports_sync: outside Sunday 8:50 PM ET window; skipping (now_et=%)',
      (now() AT TIME ZONE 'America/Toronto')::text;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/growth-reports-sync',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey',        v_apikey,
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_weekly_growth_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_secret text := public.app_setting('recurring_meetings_cron_secret');
BEGIN
  IF v_url IS NULL OR v_apikey IS NULL OR v_secret IS NULL THEN
    RAISE LOG 'trigger_weekly_growth_report: app_settings not configured; skipping';
    RETURN;
  END IF;

  IF NOT public.growth_report_in_window() THEN
    RAISE LOG 'trigger_weekly_growth_report: outside Sunday 9:00 PM ET window; skipping (now_et=%)',
      (now() AT TIME ZONE 'America/Toronto')::text;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/weekly-growth-report',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey',        v_apikey,
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_growth_reports_catchup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_secret text := public.app_setting('recurring_meetings_cron_secret');
BEGIN
  IF v_url IS NULL OR v_apikey IS NULL OR v_secret IS NULL THEN
    RAISE LOG 'trigger_growth_reports_catchup: app_settings not configured; skipping';
    RETURN;
  END IF;

  IF NOT public.growth_catchup_in_window() THEN
    RAISE LOG 'trigger_growth_reports_catchup: outside Monday 9:00 AM ET window; skipping (now_et=%)',
      (now() AT TIME ZONE 'America/Toronto')::text;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/growth-reports-sync',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey',        v_apikey,
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  );
END;
$$;

-- ── Reschedule cron jobs ──────────────────────────────────────────────────────

-- Remove all previous growth cron jobs (old names and any EST variants)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'growth-reports-sync-weekly',
  'growth-reports-sync-weekly-est',
  'growth-reports-sync-monday',
  'growth-reports-sync-monday-est',
  'weekly-growth-report',
  'weekly-growth-report-est'
);

-- ── Sunday sync: 8:50 PM ET ───────────────────────────────────────────────────
-- EDT candidate: Sunday 8:50 PM EDT = Monday 00:50 UTC
SELECT cron.schedule(
  'growth-reports-sync-weekly',
  '50 0 * * 1',
  $$ SELECT public.trigger_growth_reports_sync(); $$
);
-- EST candidate: Sunday 8:50 PM EST = Monday 01:50 UTC
-- Wall-clock guard ensures only one fires per week.
SELECT cron.schedule(
  'growth-reports-sync-weekly-est',
  '50 1 * * 1',
  $$ SELECT public.trigger_growth_reports_sync(); $$
);

-- ── Sunday report: 9:00 PM ET ─────────────────────────────────────────────────
-- EDT candidate: Sunday 9:00 PM EDT = Monday 01:00 UTC
SELECT cron.schedule(
  'weekly-growth-report',
  '0 1 * * 1',
  $$ SELECT public.trigger_weekly_growth_report(); $$
);
-- EST candidate: Sunday 9:00 PM EST = Monday 02:00 UTC
SELECT cron.schedule(
  'weekly-growth-report-est',
  '0 2 * * 1',
  $$ SELECT public.trigger_weekly_growth_report(); $$
);

-- ── Monday catch-up: 9:00 AM ET ───────────────────────────────────────────────
-- EDT candidate: Monday 9:00 AM EDT = Monday 13:00 UTC
SELECT cron.schedule(
  'growth-reports-sync-monday',
  '0 13 * * 1',
  $$ SELECT public.trigger_growth_reports_catchup(); $$
);
-- EST candidate: Monday 9:00 AM EST = Monday 14:00 UTC
SELECT cron.schedule(
  'growth-reports-sync-monday-est',
  '0 14 * * 1',
  $$ SELECT public.trigger_growth_reports_catchup(); $$
);
