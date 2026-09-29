-- CMP asks "Is your passport issued by an ECOWAS or Non-ECOWAS country?" but not the country.
-- Keep that answer in its own field instead of pretending it is passport_country.
-- Documentation rules classify from passport_country when it is set and fall back to this
-- reported region only when no country is known.

ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS passport_region text
    CHECK (passport_region IN ('ECOWAS', 'NON_ECOWAS'));

COMMENT ON COLUMN public.icplc_participants.passport_region IS
  'Passport region as reported by the participant (CMP documentation form). passport_country, when set, takes precedence for classification.';
