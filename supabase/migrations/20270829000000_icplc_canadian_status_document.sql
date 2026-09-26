-- ICPLC: Canadian Status Document Readiness + Dual-Entry (Participant Form + Nexus Staff Edit)
--
-- Adds to registrations:
--   canada_residency_status          — participant's Canadian status category (manual-only)
--   canada_status_document_readiness — operational readiness of the required document (manual-only)
--   canada_residency_status_source   — last write source: PARTICIPANT_FORM | NEXUS_MANUAL | CSV_IMPORT
--   canada_status_doc_readiness_source — same, for the readiness field
--   canada_residency_status_participant   — latest value submitted via participant form (preserved even when overridden)
--   canada_status_doc_readiness_participant — same for readiness
--   doc_update_token                 — per-registration UUID token for the participant documentation form link
--
-- The required DOCUMENT TYPE is derived from canada_residency_status in application code
-- (icplcDocReadiness.js) and is never stored — keeping the model minimal.
--
-- Field authority:
--   PARTICIPANT_FORM → source column for participant-submitted values
--   NEXUS_MANUAL     → Nexus staff edit; participant form cannot overwrite this field
--   CSV_IMPORT       → future CMP-backed import
--
-- When source = 'NEXUS_MANUAL':
--   - subsequent form submissions update _participant columns (preserving latest response)
--   - but do NOT update the main value column
-- Resume Form Sync: sets source to 'PARTICIPANT_FORM' and adopts latest _participant value immediately.
--
-- TII isolation: doc_update_token exists on all registrations rows but
-- icplc_update_documentation() validates the token maps to an ICPLC event.

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
    )),
  ADD COLUMN canada_residency_status_source text
    CHECK (canada_residency_status_source IN ('PARTICIPANT_FORM', 'NEXUS_MANUAL', 'CSV_IMPORT')),
  ADD COLUMN canada_status_doc_readiness_source text
    CHECK (canada_status_doc_readiness_source IN ('PARTICIPANT_FORM', 'NEXUS_MANUAL', 'CSV_IMPORT')),
  ADD COLUMN canada_residency_status_participant text
    CHECK (canada_residency_status_participant IN (
      'CANADIAN_CITIZEN',
      'PERMANENT_RESIDENT',
      'INTERNATIONAL_STUDENT',
      'POST_GRADUATION_WORKER',
      'WORK_PERMIT',
      'VISITOR_OTHER'
    )),
  ADD COLUMN canada_status_doc_readiness_participant text
    CHECK (canada_status_doc_readiness_participant IN (
      'UNKNOWN',
      'READY',
      'RENEWAL_NEEDED',
      'RENEWAL_IN_PROGRESS',
      'ISSUE',
      'NOT_APPLICABLE'
    )),
  ADD COLUMN doc_update_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX registrations_doc_update_token_idx
  ON public.registrations (doc_update_token);

-- ── RPC: load participant form info (anon-safe, token-gated) ─────────────────
--
-- Returns only the fields needed to render the participant form:
-- first name for greeting, event name for context, current status/readiness values.
-- Exposed to anon so unauthenticated participants can load the form.

CREATE OR REPLACE FUNCTION public.icplc_get_doc_form_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg registrations%ROWTYPE;
  v_event_name text;
BEGIN
  SELECT * INTO v_reg
  FROM registrations
  WHERE doc_update_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT ec.event_name INTO v_event_name
  FROM event_configs ec
  WHERE ec.id = v_reg.event_config_id
    AND ec.event_name ILIKE '%ICPLC%'
  LIMIT 1;

  IF v_event_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_icplc_event');
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'first_name',   coalesce(v_reg.first_name, split_part(v_reg.full_name, ' ', 1)),
    'event_name',   v_event_name,
    'canada_residency_status',         v_reg.canada_residency_status,
    'canada_status_document_readiness', v_reg.canada_status_document_readiness,
    'canada_residency_status_source',   v_reg.canada_residency_status_source,
    'canada_status_doc_readiness_source', v_reg.canada_status_doc_readiness_source
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_get_doc_form_info(uuid) TO anon, authenticated;

-- ── RPC: participant form submission (anon-safe, token-gated, field-whitelisted) ─
--
-- Validates:
--   - token → real ICPLC registration
--   - residency_status and doc_readiness values against allowed enums
--   - NEXUS_MANUAL override: always captures _participant values; only updates main
--     value when source is not NEXUS_MANUAL
--
-- Never writes: participation_status, confirmed, room assignments, finance,
--               or any other staff-controlled column.
-- Never accepts event_config_id as input — prevents cross-event manipulation.

CREATE OR REPLACE FUNCTION public.icplc_update_documentation(
  p_token           uuid,
  p_residency_status text,
  p_doc_readiness    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id          uuid;
  v_event_config_id uuid;
  v_residency_locked boolean;
  v_readiness_locked boolean;
  v_current_residency text;
  v_current_readiness text;
BEGIN
  SELECT r.id,
         r.event_config_id,
         (r.canada_residency_status_source = 'NEXUS_MANUAL')        AS residency_locked,
         (r.canada_status_doc_readiness_source = 'NEXUS_MANUAL')    AS readiness_locked,
         r.canada_residency_status,
         r.canada_status_document_readiness
  INTO v_reg_id, v_event_config_id, v_residency_locked, v_readiness_locked,
       v_current_residency, v_current_readiness
  FROM registrations r
  WHERE r.doc_update_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM event_configs ec
    WHERE ec.id = v_event_config_id
      AND ec.event_name ILIKE '%ICPLC%'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_icplc_event');
  END IF;

  IF p_residency_status IS NOT NULL AND p_residency_status NOT IN (
    'CANADIAN_CITIZEN','PERMANENT_RESIDENT','INTERNATIONAL_STUDENT',
    'POST_GRADUATION_WORKER','WORK_PERMIT','VISITOR_OTHER'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_residency_status');
  END IF;

  IF p_doc_readiness IS NOT NULL AND p_doc_readiness NOT IN (
    'UNKNOWN','READY','RENEWAL_NEEDED','RENEWAL_IN_PROGRESS','ISSUE','NOT_APPLICABLE'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_doc_readiness');
  END IF;

  UPDATE registrations SET
    -- Always capture latest participant submission (preserved even when overridden)
    canada_residency_status_participant = CASE
      WHEN p_residency_status IS NOT NULL THEN p_residency_status
      ELSE canada_residency_status_participant
    END,
    canada_status_doc_readiness_participant = CASE
      WHEN p_doc_readiness IS NOT NULL THEN p_doc_readiness
      ELSE canada_status_doc_readiness_participant
    END,
    -- Only update main value when NOT locked by a Nexus manual override
    canada_residency_status = CASE
      WHEN NOT v_residency_locked AND p_residency_status IS NOT NULL THEN p_residency_status
      ELSE canada_residency_status
    END,
    canada_status_document_readiness = CASE
      WHEN NOT v_readiness_locked AND p_doc_readiness IS NOT NULL THEN p_doc_readiness
      ELSE canada_status_document_readiness
    END,
    -- Set source on updated fields
    canada_residency_status_source = CASE
      WHEN NOT v_residency_locked AND p_residency_status IS NOT NULL THEN 'PARTICIPANT_FORM'
      ELSE canada_residency_status_source
    END,
    canada_status_doc_readiness_source = CASE
      WHEN NOT v_readiness_locked AND p_doc_readiness IS NOT NULL THEN 'PARTICIPANT_FORM'
      ELSE canada_status_doc_readiness_source
    END,
    updated_at = now()
  WHERE id = v_reg_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_update_documentation(uuid, text, text) TO anon, authenticated;

-- ── RPC: staff resumes participant-form authority for a field ─────────────────
--
-- Requires authenticated session (no anon access).
-- Sets source back to PARTICIPANT_FORM and immediately adopts the latest
-- participant-submitted value (Option A: immediate adoption).
-- If no participant value exists, the field value is unchanged.

CREATE OR REPLACE FUNCTION public.icplc_resume_form_sync(
  p_registration_id uuid,
  p_field           text   -- 'residency_status' | 'doc_readiness'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_config_id uuid;
  v_row_count       int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Verify user is authorized
  -- Allow: super_admin only (resume form sync is a staff operation, not delegated)
  IF (auth.jwt() ->> 'user_role') != 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Verify registration exists and belongs to an ICPLC event
  SELECT ec.id INTO v_event_config_id
  FROM registrations r
  JOIN event_configs ec ON r.event_config_id = ec.id
  WHERE r.id = p_registration_id
    AND ec.event_name ILIKE '%ICPLC%'
  LIMIT 1;

  IF v_event_config_id IS NULL THEN
    -- Registration not found or not ICPLC event
    IF NOT EXISTS (SELECT 1 FROM registrations WHERE id = p_registration_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'not_icplc_event');
    END IF;
  END IF;

  -- Atomic update: read and adopt latest _participant value in single UPDATE
  -- This prevents race conditions where _participant changes between initial SELECT and UPDATE
  IF p_field = 'residency_status' THEN
    UPDATE registrations SET
      canada_residency_status        = coalesce(canada_residency_status_participant, canada_residency_status),
      canada_residency_status_source = 'PARTICIPANT_FORM',
      updated_at                     = now()
    WHERE id = p_registration_id
      AND canada_residency_status_source = 'NEXUS_MANUAL';

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      -- Field was not locked by a Nexus manual override, no-op
      RETURN jsonb_build_object('ok', true, 'note', 'field_not_locked');
    END IF;

  ELSIF p_field = 'doc_readiness' THEN
    UPDATE registrations SET
      canada_status_document_readiness     = coalesce(canada_status_doc_readiness_participant, canada_status_document_readiness),
      canada_status_doc_readiness_source   = 'PARTICIPANT_FORM',
      updated_at                           = now()
    WHERE id = p_registration_id
      AND canada_status_doc_readiness_source = 'NEXUS_MANUAL';

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      -- Field was not locked by a Nexus manual override, no-op
      RETURN jsonb_build_object('ok', true, 'note', 'field_not_locked');
    END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_field');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_resume_form_sync(uuid, text) TO authenticated;

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.registrations.canada_residency_status IS
  'ICPLC: Participant''s Canadian immigration/residency status category. '
  'Manual-only — not overwritten by any sync source. NULL = not yet collected.';

COMMENT ON COLUMN public.registrations.canada_status_document_readiness IS
  'ICPLC: Operational readiness of the required Canadian status document. '
  'Derived document type lives in application code (icplcDocReadiness.js). '
  'Manual-only. NULL treated as UNKNOWN by application code.';

COMMENT ON COLUMN public.registrations.canada_residency_status_source IS
  'ICPLC: Source of the current canada_residency_status value. '
  'PARTICIPANT_FORM = last set by participant; NEXUS_MANUAL = staff override (participant form cannot overwrite).';

COMMENT ON COLUMN public.registrations.canada_status_doc_readiness_source IS
  'ICPLC: Source of the current canada_status_document_readiness value. Same semantics as canada_residency_status_source.';

COMMENT ON COLUMN public.registrations.canada_residency_status_participant IS
  'ICPLC: Latest residency status submitted by participant via form. '
  'Preserved even when overridden by Nexus staff — used for UI disagreement display and Resume Form Sync.';

COMMENT ON COLUMN public.registrations.canada_status_doc_readiness_participant IS
  'ICPLC: Latest doc readiness submitted by participant via form. Same semantics as canada_residency_status_participant.';

COMMENT ON COLUMN public.registrations.doc_update_token IS
  'Per-registration UUID token for the participant documentation form (/icplc/update/:token). '
  'Auto-generated on row creation. Stable — regenerate only via explicit staff action. '
  'Validated by icplc_update_documentation() which also checks for ICPLC event scope.';
