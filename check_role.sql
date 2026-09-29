-- Query PostgreSQL catalog for service_role attributes
-- (informational - cannot execute via PostgREST)

SELECT 
  rolname,
  rolsuper,
  rolbypassrls,
  rolinherit,
  rolcanlogin,
  rolcreatedb,
  rolcreaterole
FROM pg_roles
WHERE rolname = 'service_role';
