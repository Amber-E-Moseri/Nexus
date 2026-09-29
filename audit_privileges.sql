-- Audit current privilege model (informational only; cannot execute via PostgREST)
-- This shows what we SHOULD check against the local DB

SELECT 
  schemaname,
  tablename,
  has_table_privilege('anon', 'public.' || tablename, 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.' || tablename, 'SELECT') as auth_select,
  has_table_privilege('service_role', 'public.' || tablename, 'SELECT') as svc_select,
  has_table_privilege('service_role', 'public.' || tablename, 'INSERT') as svc_insert,
  has_table_privilege('service_role', 'public.' || tablename, 'UPDATE') as svc_update,
  has_table_privilege('service_role', 'public.' || tablename, 'DELETE') as svc_delete
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'icplc_participants',
    'icplc_import_batches',
    'icplc_import_rows',
    'icplc_identity_maps',
    'icplc_email_claims',
    'event_configs',
    'users'
  )
ORDER BY tablename;
