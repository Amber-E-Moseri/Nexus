-- ============================================================
-- FIX: the jsonb-headers http_post overload lives in the `net` schema
-- (pg_net's net.http_post), not `public` — confirmed via pg_proc/pg_namespace.
-- `SET search_path = public` on the previous version hid it, so Postgres
-- matched against the unrelated 2-arg/3-arg `public.http_post` overloads
-- (from the `http` extension) and failed to resolve. Call net.http_post
-- fully-qualified instead.
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

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/generate-recurring-meetings',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    )
  );
END;
$$;

-- Manual test trigger:
-- SELECT public.generate_recurring_meetings_trigger();
