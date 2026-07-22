-- ============================================================
-- Decouple the recurring-meetings cron auth from SUPABASE_SERVICE_ROLE_KEY.
--
-- This project has both legacy JWT-based and new opaque (sb_secret_...) API
-- keys active. Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') inside an edge
-- function resolves to the NEW-format key, but the Edge Functions gateway
-- currently only accepts the LEGACY-format key as a valid `apikey` header —
-- so a caller that satisfies the gateway can never also match
-- SUPABASE_SERVICE_ROLE_KEY. Sending the legacy key as `apikey` (to satisfy
-- the gateway) and a dedicated CRON_SHARED_SECRET as `Authorization` (checked
-- by the function's own code, independent of Supabase's key rotation) avoids
-- the mismatch entirely.
--
-- ONE-TIME MANUAL STEP required before this actually works (same class of
-- step as the supabase_url/service_role_key rows already documented in
-- 20260722000000_scheduled_sends.sql):
--   supabase secrets set CRON_SHARED_SECRET=<a random value you generate>
--   insert into public.app_settings (key, value) values
--     ('recurring_meetings_cron_secret', '<the same random value>')
--   on conflict (key) do update set value = excluded.value;
-- Until that's done, this job will keep logging "recurring_meetings_cron_secret
-- not configured; skipping" and no-op — same graceful pattern as
-- fire_scheduled_campaigns when its own app_settings rows are missing.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_recurring_meetings_trigger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_cron_secret text := public.app_setting('recurring_meetings_cron_secret');
BEGIN
  IF v_url IS NULL OR v_apikey IS NULL OR v_cron_secret IS NULL THEN
    RAISE LOG 'generate_recurring_meetings_trigger: app_settings not configured; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/generate-recurring-meetings',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey', v_apikey,
      'Authorization', 'Bearer ' || v_cron_secret,
      'Content-Type', 'application/json'
    )
  );
END;
$$;

-- Manual test trigger:
-- SELECT public.generate_recurring_meetings_trigger();
