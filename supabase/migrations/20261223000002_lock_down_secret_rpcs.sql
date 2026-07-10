-- Security fix: revoke public EXECUTE on RPCs that expose secrets.
--
-- app_setting(p_key text) reads public.app_settings, which stores the
-- Supabase service_role_key in plaintext (see 20260722000000_scheduled_sends.sql).
-- The Postgres default is EXECUTE granted to PUBLIC, which Supabase exposes to
-- anon/authenticated via PostgREST. That meant any unauthenticated request to
-- /rest/v1/rpc/app_setting with p_key=service_role_key returned a key that
-- bypasses RLS on every table.
--
-- vault_get_secret(secret_id uuid) / vault_create_secret(secret_name, secret_value)
-- have the same exposure: no auth check in the function body, callable by
-- anon/authenticated, and used to store Google Calendar/Drive OAuth tokens and
-- Zoom credentials (20260710000002_vault_encrypt_calendar_tokens.sql,
-- 20260731000001_vault_zoom_credentials.sql).
--
-- All three are only ever called from edge functions authenticated with the
-- service_role key (google-calendar-sync, store-vault-secret) or from other
-- SECURITY DEFINER functions internally (fire_scheduled_campaigns). No
-- client-side code calls these RPCs directly, so restricting to service_role
-- does not change any existing behavior.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_setting' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.app_setting(text) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'vault_get_secret' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.vault_get_secret(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.vault_get_secret(uuid) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'vault_create_secret' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.vault_create_secret(text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text) TO service_role;
  END IF;
END
$$;
