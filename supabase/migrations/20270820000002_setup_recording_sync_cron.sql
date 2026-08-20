-- Phase 7: Set up pg_cron jobs for Zoom recording sync and intelligence generation
-- Both jobs call nova-jobs dispatcher with service-role authentication.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Recording sync: every 15 minutes ────────────────────────────────────────
-- Downloads pending Zoom recordings and fetches transcripts.

SELECT cron.unschedule('zoom-recording-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'zoom-recording-sync'
);

SELECT cron.schedule(
  'zoom-recording-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT current_setting('app.nova_jobs_secret')),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"process_recording_sync"}'::jsonb
  );
  $$
);

-- ── Recording intelligence: every 30 minutes (offset by 7 min from sync) ────
-- Runs completed recording transcripts through extract-meeting-data, the same
-- AI extraction pipeline used for manually-transcribed meetings, surfacing
-- results in the meeting's existing "AI Extract" tab for human review.

SELECT cron.unschedule('zoom-recording-intelligence') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'zoom-recording-intelligence'
);

SELECT cron.schedule(
  'zoom-recording-intelligence',
  '7,37 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT current_setting('app.nova_jobs_secret')),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"generate_recording_intelligence"}'::jsonb
  );
  $$
);

-- Note: app.nova_jobs_secret must be set in Supabase Vault or app settings:
-- ALTER DATABASE postgres SET app.nova_jobs_secret = '<value>';
