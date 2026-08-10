-- ============================================================
-- REGISTRATION API SYNC — SCHEDULED CRON JOBS
-- Syncs registrations + flights from Ministry Platform every
-- 4 hours, automatically stopping after Aug 27 2026.
--
-- Two jobs are registered (one per form) because pg_cron
-- executes a single SQL statement per job.
-- ============================================================

-- pg_cron and pg_net are already enabled on this project.
-- cron.schedule(name, ...) is an upsert — safe to re-run.

-- ─── Job 1: Registration form ───────────────────────────────
SELECT cron.schedule(
  'registration-sync-registrations-4h',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT current_setting('app.supabase_url'))
                 || '/functions/v1/registration-api-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"action":"apply","form":"registrations"}'::jsonb
  )
  WHERE (NOW() AT TIME ZONE 'America/Toronto')::date <= '2026-08-27'::date;
  $$
);

-- ─── Job 2: Flights form ────────────────────────────────────
SELECT cron.schedule(
  'registration-sync-flights-4h',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT current_setting('app.supabase_url'))
                 || '/functions/v1/registration-api-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"action":"apply","form":"flights"}'::jsonb
  )
  WHERE (NOW() AT TIME ZONE 'America/Toronto')::date <= '2026-08-27'::date;
  $$
);
