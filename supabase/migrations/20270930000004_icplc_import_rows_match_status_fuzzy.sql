-- icplc_match_import_rows (20260929000002) writes auto_kingschat, auto_fuzzy_email
-- and auto_fuzzy_name, but icplc_import_rows_match_status_check (20260925000005)
-- only allows auto/manual/persistent/unmatched/error, so the Match step failed with
-- a check-constraint violation. Widen the constraint to the values the matcher emits.

ALTER TABLE public.icplc_import_rows
  DROP CONSTRAINT IF EXISTS icplc_import_rows_match_status_check;

ALTER TABLE public.icplc_import_rows
  ADD CONSTRAINT icplc_import_rows_match_status_check
  CHECK (match_status IN (
    'auto', 'manual', 'persistent', 'unmatched', 'error',
    'auto_kingschat', 'auto_fuzzy_email', 'auto_fuzzy_name'
  ));
