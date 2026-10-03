-- Phase 0B: scheduler recovery (production audit 2026-10-01).
--
-- LIVE FINDINGS (read-only audit)
--   meeting-reminders-hourly          336/336 runs failed : current_setting('app.supabase_url') is not provided by hosted Supabase
--   due-date-reminders-evening        14/14 failed        : same
--   due-date-reminders (morning)      job missing from cron.job
--   daily-digest                      14/14 failed        : current_setting('app.settings.supabase_url') not provided
--   delegated-task-reminders-hourly   cron "succeeds" but HTTP 401: Authorization header was "Bearer [<legacy key>]" (literal brackets)
--   task-overdue-trigger-hourly       cron "succeeds" but HTTP 401: Authorization header held the key with no "Bearer " prefix
--   task-notification-email-batch     cron "succeeds" but HTTP 401: legacy key != the function's SUPABASE_SERVICE_ROLE_KEY (new-format key)
--   (the last three also embedded the legacy service-role key as a literal in cron.job.command)
--
-- FIX: the repository's canonical hosted pattern (Growth 20271001000004, recurring meetings 20270724000204):
--   * one SECURITY DEFINER helper reads supabase_url / service_role_key / recurring_meetings_cron_secret
--     from public.app_settings (no GUCs, no literals in cron.job);
--   * apikey = legacy service key (gateway admission), Authorization = Bearer CRON_SHARED_SECRET
--     (checked inside each function by _shared/internalAuth.ts);
--   * jobs are re-registered by name (cron.schedule upserts), so no duplicate schedules.
-- Schedules and request bodies are unchanged from the live ones (the evening due-date job keeps
-- {"mode":"evening"}); the morning due-date job (12:00 UTC) from 20260912000000 is restored.
--
-- THIS MIGRATION DOES NOT TOUCH DATA. The stale unsent task-email backlog in public.notifications
-- (email_sent_at IS NULL) is deliberately left untouched; its disposition is a separate decision.
-- See docs/audits/PHASE0_FINAL_RELEASE_CERTIFICATION_2026-10-02.md for the classification.
--
-- REQUIRES (present live, verified read-only): app_settings keys supabase_url, service_role_key,
-- recurring_meetings_cron_secret; Edge secret CRON_SHARED_SECRET with the same value; the six functions
-- deployed with the internalAuth change BEFORE this migration is applied.
-- No secret values appear in this file.

-- ── Helper ────────────────────────────────────────────────────────────────────
create or replace function public.invoke_internal_function(p_function text, p_body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_secret text := public.app_setting('recurring_meetings_cron_secret');
begin
  -- Allowlist: this helper can only reach scheduler-owned functions.
  if p_function not in (
    'meeting-reminders', 'due-date-reminders', 'daily-digest',
    'delegated-task-reminders', 'task-overdue-trigger', 'task-notification-email-batch'
  ) then
    raise exception 'invoke_internal_function: function % not allowed', p_function;
  end if;

  if v_url is null or v_apikey is null or v_secret is null then
    raise log 'invoke_internal_function(%): app_settings not configured; skipping', p_function;
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/' || p_function,
    body    := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object(
      'apikey',        v_apikey,
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  );
end;
$$;

-- Only the scheduler (postgres / service_role) may invoke it; never PostgREST callers.
revoke all on function public.invoke_internal_function(text, jsonb) from public, anon, authenticated;
grant execute on function public.invoke_internal_function(text, jsonb) to service_role;

-- ── Re-register jobs (names preserved; old commands with GUCs / literals are replaced) ───────
do $$
declare j text;
begin
  for j in
    select jobname from cron.job where jobname in (
      'meeting-reminders-hourly', 'due-date-reminders', 'due-date-reminders-evening',
      'daily-digest', 'delegated-task-reminders-hourly', 'task-overdue-trigger-hourly',
      'task-notification-email-batch'
    )
  loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule('meeting-reminders-hourly',        '0 * * * *',   $$ select public.invoke_internal_function('meeting-reminders'); $$);
select cron.schedule('due-date-reminders',              '0 12 * * *',  $$ select public.invoke_internal_function('due-date-reminders'); $$);
select cron.schedule('due-date-reminders-evening',      '0 23 * * *',  $$ select public.invoke_internal_function('due-date-reminders', '{"mode":"evening"}'::jsonb); $$);
select cron.schedule('daily-digest',                    '0 13 * * *',  $$ select public.invoke_internal_function('daily-digest'); $$);
select cron.schedule('delegated-task-reminders-hourly', '0 * * * *',   $$ select public.invoke_internal_function('delegated-task-reminders'); $$);
select cron.schedule('task-overdue-trigger-hourly',     '0 * * * *',   $$ select public.invoke_internal_function('task-overdue-trigger'); $$);
select cron.schedule('task-notification-email-batch',   '0 */3 * * *', $$ select public.invoke_internal_function('task-notification-email-batch'); $$);
