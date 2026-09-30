-- ICPLC: "Would you like assistance from the ICPLC team with your immigration or travel documentation?"
-- Stored as its own nullable boolean so staff can correct it and re-syncs cannot overwrite that correction
-- (override_fields.documentation_assistance_requested). NULL = not answered / unknown.
--
-- Operationally this feeds the Nigerian visa / travel-documentation follow-up queue. It says nothing about
-- passport or Canadian immigration document renewal, which ICPLC does not provide.
--
-- Existing participants: nothing is backfilled here. The app derives the value from the raw CMP answer already
-- kept in source_values.cmp_documentation.assistance_requested until this column is set.
-- Apply BEFORE deploying the updated cmp-documentation-sync function.

ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS documentation_assistance_requested boolean;

COMMENT ON COLUMN public.icplc_participants.documentation_assistance_requested IS
  'Participant asked for ICPLC help with immigration/travel documentation (drives the visa follow-up queue). NULL = unknown. Independent of readiness.';
