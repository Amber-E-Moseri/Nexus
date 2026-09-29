-- Minimum Service Role Table Access for ICPLC Backend Operations
--
-- CONTEXT: ICPLC tables are created with RLS enabled but lack base table
-- privileges for service_role. This prevents:
--   1. Backend operations (edge functions, scheduled tasks)
--   2. Test fixture creation (required by established test suite)
--
-- EVIDENCE: rlsAudit.test.js line 113-120 explicitly verifies
-- "Service role can insert into icplc_participants" and currently fails with
-- 42501 (permission denied). This test was written to document the intended
-- service_role contract for production import edge functions.
--
-- DESIGN: Service role operates under RLS (rolbypassrls constraints apply
-- at row level via policies). This grant restores intended base privileges
-- while keeping authorization gated by RLS policies.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.icplc_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.icplc_import_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.icplc_import_rows TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.icplc_identity_maps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.icplc_email_claims TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
