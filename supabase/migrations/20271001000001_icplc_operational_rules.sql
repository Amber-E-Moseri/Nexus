-- ICPLC operational rules:
--   1. Flight Not Required (e.g. already in Nigeria): a recorded exception with reason, note, who and when.
--      Nothing is fabricated: no itinerary and no flight rows are created. Registration is never waived by it.
--   2. Documentation review acknowledgement: staff once-over of a participant whose documentation INFORMATION is
--      incomplete. It records that staff looked (who, when, and WHICH missing-information state). It does not verify
--      any document, fill any value, change readiness or clear a real problem; the app only lets it set aside the
--      "information incomplete" attention while that same state persists.
--   3. Extend the existing participant audit trigger so changes to these fields, and to
--      documentation_assistance_requested, are audited the same way as every other tracked participant field.
--
-- Registration has no "not required" state and this migration adds none.
-- Apply after 20271001000000_icplc_documentation_assistance.sql.

ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS flight_not_required_reason text,
  ADD COLUMN IF NOT EXISTS flight_not_required_note   text,
  ADD COLUMN IF NOT EXISTS flight_not_required_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flight_not_required_at     timestamptz,
  ADD COLUMN IF NOT EXISTS documentation_review_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS documentation_review_at    timestamptz,
  -- The missing-information state that was reviewed (sorted missing-information keys). The review only applies
  -- while the current state matches it, so it is never a permanent exemption.
  ADD COLUMN IF NOT EXISTS documentation_review_fingerprint text;

-- The reason is an open value (e.g. 'already_in_nigeria', 'other') so new reasons need no migration;
-- it just may not be blank when present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'icplc_participants_flight_not_required_reason_chk') THEN
    ALTER TABLE public.icplc_participants
      ADD CONSTRAINT icplc_participants_flight_not_required_reason_chk
      CHECK (flight_not_required_reason IS NULL OR length(btrim(flight_not_required_reason)) > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.icplc_participants.flight_not_required_reason IS
  'Set when the participant needs no ICPLC flight (e.g. already_in_nigeria). NULL = a flight is expected.';
COMMENT ON COLUMN public.icplc_participants.documentation_review_at IS
  'Staff acknowledged the "documentation information incomplete" state. Not a document verification.';
COMMENT ON COLUMN public.icplc_participants.documentation_review_fingerprint IS
  'Sorted missing-information keys at the time of the review. The acknowledgement stops applying when this no longer matches.';

-- Same function as 20270930000030 with the new operational fields added to the tracked list.
CREATE OR REPLACE FUNCTION public.icplc_audit_participant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  -- Operational fields only. source_values / override_fields / updated_at are bookkeeping, not decisions.
  v_tracked text[] := ARRAY[
    'full_name', 'email', 'alternate_email', 'region', 'subgroup', 'group_name', 'leadership', 'notes',
    'gender', 'kingschat_username', 'kingschat_user_id',
    'participation_status', 'registration_status',
    'canada_residency_status', 'canada_status_document_readiness',
    'passport_country', 'passport_readiness', 'passport_region',
    'visa_requirement', 'visa_process_status',
    'documentation_assistance_requested',
    'flight_not_required_reason', 'flight_not_required_note',
    'documentation_review_at', 'documentation_review_fingerprint',
    'arrival_date', 'arrival_time', 'arrival_flight', 'departure_date', 'departure_time', 'departure_flight'
  ];
  v_old jsonb;
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_actor uuid := auth.uid();
  v_source text;
  v_reason text := NULLIF(current_setting('icplc.change_reason', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_source := CASE WHEN v_actor IS NULL THEN 'system' ELSE 'app' END;
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN v_actor END,
      'participant_created', 'icplc_participant', NEW.id,
      jsonb_strip_nulls(jsonb_build_object('actor_id', v_actor, 'source', v_source, 'reason', v_reason, 'full_name', NEW.full_name))
    );
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  FOREACH v_field IN ARRAY v_tracked LOOP
    -- A column that does not exist yet on an older schema is simply absent from both rows.
    IF v_old ? v_field AND (v_old -> v_field) IS DISTINCT FROM (v_new -> v_field) THEN
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', v_old -> v_field, 'to', v_new -> v_field));
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_source := COALESCE(NULLIF(current_setting('icplc.change_source', true), ''), CASE WHEN v_actor IS NULL THEN 'system' ELSE 'app' END);

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN v_actor END,
    'participant_updated', 'icplc_participant', NEW.id,
    -- strip only the top-level empties: a change FROM null must keep its explicit "from": null
    jsonb_strip_nulls(jsonb_build_object('actor_id', v_actor, 'source', v_source, 'reason', v_reason)) || jsonb_build_object('changes', v_changes)
  );
  RETURN NEW;
END;
$$;
