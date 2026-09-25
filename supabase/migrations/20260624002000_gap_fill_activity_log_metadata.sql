-- Gap-fill: metadata column was missing from activity_log in the initial schema.
-- Migrations at 20260625+ (calendar_system_foundation) insert with metadata.
-- The icplc_apply_import_row RPC also inserts metadata.

alter table public.activity_log
  add column if not exists metadata jsonb;
