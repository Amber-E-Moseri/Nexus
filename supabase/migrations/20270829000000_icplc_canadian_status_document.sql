-- ICPLC: staff-managed Canadian documentation fields on canonical participants.
--
-- This intentionally does not add public participant-form infrastructure,
-- participant-response shadow columns, or resume-form sync behavior.
--
-- Required document type is derived in application code from
-- icplc_participants.canada_residency_status and is not stored.

ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS canada_status_document_readiness text
    CHECK (canada_status_document_readiness IN (
      'UNKNOWN',
      'READY',
      'RENEWAL_NEEDED',
      'RENEWAL_IN_PROGRESS',
      'ISSUE',
      'NOT_APPLICABLE'
    ));

COMMENT ON COLUMN public.icplc_participants.canada_residency_status IS
  'ICPLC operational Canadian residency/status category. Used only to derive required status-document workflow; not a legal eligibility determination.';

COMMENT ON COLUMN public.icplc_participants.canada_status_document_readiness IS
  'ICPLC operational readiness of the derived Canadian status document. Required document type is derived in application code and is not stored.';

-- Extend the existing confirmed identity-map boundary instead of creating a
-- second registration/participant identity system.
ALTER TABLE public.icplc_identity_maps
  DROP CONSTRAINT IF EXISTS icplc_identity_maps_source_type_check;

ALTER TABLE public.icplc_identity_maps
  ADD CONSTRAINT icplc_identity_maps_source_type_check
  CHECK (source_type IN (
    'csv',
    'cmp_registrations',
    'cmp_flights',
    'registration',
    'mi_member'
  ));

COMMENT ON TABLE public.icplc_identity_maps IS
  'Persistent confirmed source-to-ICPLC participant mappings. Used for imports, registration reconciliation, and one-time pool copy provenance.';
