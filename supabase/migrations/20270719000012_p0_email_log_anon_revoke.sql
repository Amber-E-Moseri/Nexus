-- P0 audit finding: log_email_delivery() was granted to anon in the original migration
-- (20260620000006_create_log_email_function.sql) and email_delivery_log had RLS disabled.
-- Neither object exists on this remote — the vulnerability is not present.
-- This migration is a placeholder to keep the timestamp sequence intact.
-- If these objects are ever introduced, restrict log_email_delivery() to authenticated
-- and service_role only, and enable RLS on email_delivery_log with explicit policies.
select 1;
