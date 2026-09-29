-- icplc_apply_registration_import selected rows with
--   apply_status NOT IN ('error', 'skipped')
-- but freshly matched rows have apply_status NULL, and NULL NOT IN (...) is NULL (not true),
-- so the loop processed zero rows: "Applied 0, Protected 0, Errors 0".
-- Treat NULL as "not yet applied". Patched in place so the rest of the function is untouched.
DO $$
DECLARE
  r RECORD;
  pat CONSTANT text := 'apply_status NOT IN \(''error'', ''skipped''\)';
  rep CONSTANT text := 'COALESCE(apply_status, '''') NOT IN (''error'', ''skipped'')';
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'icplc_apply_registration_import'
      AND p.prosrc ~* pat
  LOOP
    EXECUTE regexp_replace(pg_get_functiondef(r.oid), pat, rep, 'gi');
  END LOOP;
END;
$$;
