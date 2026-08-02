-- Growth Tracking — pg_cron jobs
-- Sunday sync:  8:50 PM ET  = Monday 00:50 UTC (EDT) / 01:50 UTC (EST)
-- Sunday report: 9:00 PM ET = Monday 01:00 UTC (EDT) / 02:00 UTC (EST)
-- Monday catch-up sync: 9:00 AM ET = Monday 13:00 UTC (EDT) / 14:00 UTC (EST)
--   Catches late Sunday submissions that weren't in the system by 8:50 PM.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('growth-reports-sync-weekly', 'growth-reports-sync-monday', 'weekly-growth-report');

SELECT cron.schedule(
  'growth-reports-sync-weekly',
  '50 0 * * 1',
  $$
  SELECT net.http_post(
    url     := (SELECT current_setting('app.supabase_url')) || '/functions/v1/growth-reports-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'growth-reports-sync-monday',
  '0 13 * * 1',
  $$
  SELECT net.http_post(
    url     := (SELECT current_setting('app.supabase_url')) || '/functions/v1/growth-reports-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'weekly-growth-report',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url     := (SELECT current_setting('app.supabase_url')) || '/functions/v1/weekly-growth-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
