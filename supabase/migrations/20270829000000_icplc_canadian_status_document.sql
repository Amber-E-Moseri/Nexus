-- ICPLC: Canadian Status Document Readiness
-- Adds two columns to the shared registrations table:
--
--   canada_residency_status          — participant's Canadian status category (manual, never synced)
--   canada_status_document_readiness — operational readiness of the required document (manual, never synced)
--
-- The required DOCUMENT TYPE is derived from canada_residency_status in application code
-- (icplcDocReadiness.js) and is never stored — keeping the model minimal and the
-- status→document mapping configurable without schema changes.
--
-- Both columns are manual-only: registration-api-sync and flight-sync do NOT write them,
-- so no manual_override guard is needed.
--
-- Existing rows get NULL (= not yet collected). Application code treats NULL as UNKNOWN.
-- No residency or document facts are inferred from existing participant data.

ALTER TABLE public.registrations
  ADD COLUMN canada_residency_status text
    CHECK (canada_residency_status IN (
      'CANADIAN_CITIZEN',
      'PERMANENT_RESIDENT',
      'INTERNATIONAL_STUDENT',
      'POST_GRADUATION_WORKER',
      'WORK_PERMIT',
      'VISITOR_OTHER'
    )),
  ADD COLUMN canada_status_document_readiness text
    CHECK (canada_status_document_readiness IN (
      'UNKNOWN',
      'READY',
      'RENEWAL_NEEDED',
      'RENEWAL_IN_PROGRESS',
      'ISSUE',
      'NOT_APPLICABLE'
    ));

COMMENT ON COLUMN public.registrations.canada_residency_status IS
  'Participant''s Canadian immigration/residency status category. '
  'Manual-only — not overwritten by registration platform sync. '
  'NULL means status information not yet collected. '
  'Allowed: CANADIAN_CITIZEN | PERMANENT_RESIDENT | INTERNATIONAL_STUDENT | '
  'POST_GRADUATION_WORKER | WORK_PERMIT | VISITOR_OTHER.';

COMMENT ON COLUMN public.registrations.canada_status_document_readiness IS
  'Operational readiness of the required Canadian status document. '
  'The required document type is derived from canada_residency_status in application code '
  '(study permit → INTERNATIONAL_STUDENT, PGWP → POST_GRADUATION_WORKER, PR card → PERMANENT_RESIDENT, etc.). '
  'Manual-only — not overwritten by any sync source. NULL treated as UNKNOWN by application code. '
  'Allowed: UNKNOWN | READY | RENEWAL_NEEDED | RENEWAL_IN_PROGRESS | ISSUE | NOT_APPLICABLE.';
