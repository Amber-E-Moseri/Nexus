-- Fix: all 5 pg_cron jobs that call nova-jobs were failing to authenticate.
-- Two (nova-cleanup-audit-data, nova-check-budget) had a copy-paste bug —
-- hardcoded to NOVA_ACTION_SECRET's value instead of NOVA_JOBS_SECRET's.
-- Three (nova-embed-content-weekly, zoom-recording-sync, zoom-recording-intelligence)
-- referenced current_setting('app.nova_jobs_secret') / current_setting('app.supabase_url'),
-- neither of which was ever configured at the database level — ALTER DATABASE
-- SET requires project-owner/dashboard access this migration's execution role
-- doesn't have.
--
-- Fix, per Supabase Support: use Vault instead of database-level GUC settings.
-- NOVA_JOBS_SECRET was rotated and the new value stored in Vault under the
-- name 'nova_jobs_secret' (via the existing public.vault_upsert_secret RPC —
-- see 20261224000001_vault_upsert_secret.sql). Every job body below now pulls
-- the secret from vault.decrypted_secrets at execution time — the plaintext
-- value never appears in this file, in cron.job_run_details, or in logs.
-- The project URL is not secret, so it's inlined directly instead of relying
-- on a GUC setting.
--
-- cron.schedule(name, ...) is an upsert — safe to re-run, matches the
-- existing convention in 20270820000002_setup_recording_sync_cron.sql.

SELECT cron.schedule(
  'nova-cleanup-audit-data',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kraurtuhflouyorgtpun.supabase.co/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nova_jobs_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"cleanup_audit_data"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'nova-check-budget',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kraurtuhflouyorgtpun.supabase.co/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nova_jobs_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"check_budget_health"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'nova-embed-content-weekly',
  '0 7 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://kraurtuhflouyorgtpun.supabase.co/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nova_jobs_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"embed_content"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'zoom-recording-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kraurtuhflouyorgtpun.supabase.co/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nova_jobs_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"process_recording_sync"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'zoom-recording-intelligence',
  '7,37 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kraurtuhflouyorgtpun.supabase.co/functions/v1/nova-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nova_jobs_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"job":"generate_recording_intelligence"}'::jsonb
  );
  $$
);
