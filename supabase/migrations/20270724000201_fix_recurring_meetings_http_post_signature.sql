-- ============================================================
-- FIX: generate_recurring_meetings_trigger() called http_post() with an
-- http_header[] argument, but this database's `http` extension only exposes:
--   http_post(uri, data jsonb)
--   http_post(uri, content, content_type)
--   http_post(url, body jsonb, params jsonb, headers jsonb, timeout_ms)
-- (confirmed via pg_proc — no http_header[] overload exists here). Switch to
-- the 5-arg overload, passing headers as jsonb instead.
-- ============================================================

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
    url     := v_url || '/functions/v1/generate-recurring-meetings',
    body    := '{}'::jsonb,
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    )
  );
END;
$$;

-- Manual test trigger:
-- SELECT public.generate_recurring_meetings_trigger();
