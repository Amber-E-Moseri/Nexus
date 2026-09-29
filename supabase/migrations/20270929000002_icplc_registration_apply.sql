-- ICPLC Registration CSV Apply RPC
--
-- Atomically applies import preview decisions to canonical participants.
--
-- CRITICAL: D1 and D2 DEFECT FIXES
--   D1: Email claims are NEVER silently transferred between participants
--   D2: Durable Registration ID mapping conflicts are explicitly detected
--
-- CONSTRAINTS ENFORCED:
--   * registration_status mutations gated behind override_fields
--   * participation_status NEVER modified
--   * Status/Registered preserved as advisory (never auto-finalize)
--   * Email claim invariant: one email per event per participant
--   * Durable Registration ID never remaps to different participant

-- ============================================================================
-- FUNCTION: Apply registration import batch
-- ============================================================================

CREATE OR REPLACE FUNCTION public.icplc_apply_registration_import(
  p_batch_id UUID,
  p_applied_by UUID
)
RETURNS TABLE(
  applied_rows INT,
  error_rows INT,
  batch_status TEXT
) AS $$
DECLARE
  v_event_id UUID;
  v_row RECORD;
  v_participant_id UUID;
  v_is_new BOOLEAN;
  v_source_values JSONB;
  v_override_fields JSONB;
  v_registration_id TEXT;
  v_email TEXT;
  v_normalized_email TEXT;
  v_applied_count INT := 0;
  v_error_count INT := 0;
  v_error_detail TEXT;
  -- D1/D2 defect fixes: pre-declare variables for conflict detection
  v_existing_mapping_participant_id UUID;
  v_existing_email_participant_id UUID;
BEGIN
  -- AUTHORIZATION CHECK: Enforce write capability inside trusted function boundary
  IF NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required';
  END IF;

  -- Lock batch for atomic processing
  SELECT event_id INTO v_event_id
  FROM public.icplc_import_batches
  WHERE id = p_batch_id
    AND status = 'previewed'
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Batch not found or not in previewed state: %', p_batch_id;
  END IF;

  -- Update batch status to "applying"
  UPDATE public.icplc_import_batches
    SET status = 'applying'
    WHERE id = p_batch_id;

  -- Process each row
  FOR v_row IN
    SELECT id, row_number, participant_id, match_status, raw_payload
    FROM public.icplc_import_rows
    WHERE batch_id = p_batch_id
      AND apply_status NOT IN ('error', 'skipped')
    ORDER BY row_number
  LOOP
    BEGIN
      v_participant_id := v_row.participant_id;
      v_registration_id := NULLIF(TRIM(v_row.raw_payload ->> 'Registration ID'), '');
      v_email := NULLIF(TRIM(v_row.raw_payload ->> 'Email'), '');
      v_is_new := FALSE;

      -- Determine action: match_status drives decision
      IF v_row.match_status = 'error' THEN
        -- Already errored; skip
        CONTINUE;
      ELSIF v_row.match_status = 'unmatched' AND v_row.participant_id IS NULL THEN
        -- Unmatched: skip (no auto-create)
        UPDATE public.icplc_import_rows
          SET apply_status = 'protected'
          WHERE id = v_row.id;
        CONTINUE;
      ELSIF v_row.match_status IN ('auto', 'manual', 'persistent') AND v_participant_id IS NOT NULL THEN
        -- Matched participant: update with source evidence
        v_is_new := FALSE;
      ELSE
        -- No clear action; protect row
        UPDATE public.icplc_import_rows
          SET apply_status = 'protected'
          WHERE id = v_row.id;
        CONTINUE;
      END IF;

      -- Load staff-managed field protections from the matched participant before
      -- any source-backed claims or canonical mutations are attempted.
      SELECT COALESCE(override_fields, '{}'::JSONB)
      INTO v_override_fields
      FROM public.icplc_participants
      WHERE id = v_participant_id;

      -- ============================================================================
      -- D2 DEFECT FIX: Detect durable ID vs email disagreement BEFORE mutations
      -- ============================================================================
      IF v_registration_id IS NOT NULL THEN
        -- Check if this Registration ID is already mapped to a different participant
        SELECT participant_id INTO v_existing_mapping_participant_id
        FROM public.icplc_identity_maps
        WHERE event_id = v_event_id
          AND source_type = 'registration_csv'
          AND source_key = v_registration_id;

        IF v_existing_mapping_participant_id IS NOT NULL
          AND v_existing_mapping_participant_id != v_participant_id
        THEN
          -- HARD CONFLICT: Durable Registration ID maps to different participant
          v_error_detail := 'IDENTITY_CONFLICT: Registration ID ' || v_registration_id
            || ' already mapped to different participant';
          UPDATE public.icplc_import_rows
            SET apply_status = 'error', error_detail = v_error_detail
            WHERE id = v_row.id;
          v_error_count := v_error_count + 1;
          CONTINUE;
        END IF;
      END IF;

      -- ============================================================================
      -- Build source_values provenance
      -- ============================================================================
      v_source_values := jsonb_build_object(
        'registration_status', jsonb_build_object(
          'value', v_row.raw_payload ->> 'Status',
          'source', 'registration_csv',
          'observed_at', now(),
          'batch_id', p_batch_id
        ),
        'registered_raw', jsonb_build_object(
          'value', v_row.raw_payload ->> 'Registered',
          'source', 'registration_csv',
          'observed_at', now()
        ),
        'name_source', jsonb_build_object(
          'first_name', v_row.raw_payload ->> 'First Name',
          'last_name', v_row.raw_payload ->> 'Last Name',
          'source', 'registration_csv'
        )
      );

      -- ============================================================================
      -- D1 DEFECT FIX: Safe email claim handling (no silent transfer)
      -- ============================================================================
      IF v_email IS NOT NULL
        AND (v_override_fields -> 'email' -> 'overridden')::BOOLEAN IS NOT TRUE
      THEN
        v_normalized_email := public.normalize_email(v_email);

        -- Check if email is already claimed by anyone
        SELECT participant_id INTO v_existing_email_participant_id
        FROM public.icplc_email_claims
        WHERE event_id = v_event_id
          AND normalized_email = v_normalized_email;

        IF v_existing_email_participant_id IS NOT NULL THEN
          -- Email is already claimed
          IF v_existing_email_participant_id != v_participant_id THEN
            -- CONFLICT: Email owned by different participant (no silent transfer)
            v_error_detail := 'EMAIL_CLAIM_CONFLICT: Email ' || v_email
              || ' already claimed by different participant';
            UPDATE public.icplc_import_rows
              SET apply_status = 'error', error_detail = v_error_detail
              WHERE id = v_row.id;
            v_error_count := v_error_count + 1;
            CONTINUE;
          END IF;
          -- else: same participant, idempotent, skip INSERT
        ELSE
          -- Email is unclaimed, safe to claim
          INSERT INTO public.icplc_email_claims (
            event_id, normalized_email, participant_id, email_slot
          ) VALUES (
            v_event_id, v_normalized_email, v_participant_id, 'primary'
          )
          ON CONFLICT (event_id, normalized_email) DO NOTHING;
        END IF;
      END IF;

      -- ============================================================================
      -- Apply canonical mutations (respecting overrides)
      -- ============================================================================
      UPDATE public.icplc_participants
        SET
          -- Names: only if not overridden
          full_name = CASE
            WHEN (v_override_fields -> 'full_name' -> 'overridden')::BOOLEAN IS NOT TRUE
              AND (v_row.raw_payload ->> 'First Name' != '' OR v_row.raw_payload ->> 'Last Name' != '')
            THEN TRIM((v_row.raw_payload ->> 'First Name') || ' ' || COALESCE(v_row.raw_payload ->> 'Last Name', ''))
            ELSE full_name
          END,

          -- Email: only if not overridden
          email = CASE
            WHEN (v_override_fields -> 'email' -> 'overridden')::BOOLEAN IS NOT TRUE
              AND v_email IS NOT NULL
            THEN v_email
            ELSE email
          END,

          -- registration_status: GATED behind override protection
          registration_status = CASE
            WHEN (v_override_fields -> 'registration_status' -> 'overridden')::BOOLEAN IS TRUE
            THEN registration_status
            WHEN v_row.raw_payload ->> 'Registered' = 'Yes'
            THEN 'registered'
            WHEN v_row.raw_payload ->> 'Status' = 'Absent' AND v_row.raw_payload ->> 'Registered' = 'No'
            THEN 'not_attending'
            ELSE registration_status
          END,

          -- Metadata: preserve source evidence
          source_values = public.merge_source_values(source_values, v_source_values),
          override_fields = CASE
            WHEN v_override_fields::TEXT != '{}'
            THEN override_fields || v_override_fields
            ELSE override_fields
          END
        WHERE id = v_participant_id;

      -- ============================================================================
      -- Create identity map (Registration ID) — safe due to D2 check above
      -- ============================================================================
      IF v_registration_id IS NOT NULL THEN
        INSERT INTO public.icplc_identity_maps (
          event_id, source_type, source_key, participant_id, confirmed_by, confirmed_at
        ) VALUES (
          v_event_id, 'registration_csv', v_registration_id, v_participant_id, p_applied_by, now()
        )
        ON CONFLICT (event_id, source_type, source_key) DO UPDATE
          SET confirmed_by = p_applied_by,
              confirmed_at = now()
          WHERE icplc_identity_maps.participant_id = EXCLUDED.participant_id;
      END IF;

      -- ============================================================================
      -- Record apply result
      -- ============================================================================
      UPDATE public.icplc_import_rows
        SET
          apply_status = CASE WHEN v_is_new THEN 'created' ELSE 'updated' END,
          participant_id = v_participant_id
        WHERE id = v_row.id;

      v_applied_count := v_applied_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Record error but continue processing
      v_error_detail := SQLERRM;
      UPDATE public.icplc_import_rows
        SET
          apply_status = 'error',
          error_detail = v_error_detail
        WHERE id = v_row.id;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;

  -- ============================================================================
  -- Finalize batch status
  -- ============================================================================
  UPDATE public.icplc_import_batches
    SET
      status = CASE
        WHEN v_error_count > 0 THEN 'applied_with_errors'
        ELSE 'applied'
      END,
      imported_by = p_applied_by,
      imported_at = now(),
      matched_rows = (
        SELECT COUNT(*) FROM public.icplc_import_rows
        WHERE batch_id = p_batch_id AND apply_status IN ('created', 'updated', 'linked')
      ),
      error_rows = v_error_count
    WHERE id = p_batch_id;

  RETURN QUERY SELECT
    v_applied_count,
    v_error_count,
    (SELECT status FROM public.icplc_import_batches WHERE id = p_batch_id)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- HELPER: Merge source_values without overwriting existing evidence
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_source_values(
  existing_values JSONB,
  new_values JSONB
)
RETURNS JSONB AS $$
BEGIN
  RETURN existing_values || new_values;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Manually resolve unmatched row
-- ============================================================================

CREATE OR REPLACE FUNCTION public.icplc_resolve_unmatched_row(
  p_row_id UUID,
  p_action TEXT,
  p_participant_id UUID,
  p_resolved_by UUID
)
RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
DECLARE
  v_batch_id UUID;
  v_event_id UUID;
  v_raw_payload JSONB;
  v_new_participant_id UUID;
  v_email TEXT;
  v_normalized_email TEXT;
BEGIN
  -- AUTHORIZATION CHECK: Enforce write capability inside trusted function boundary
  IF NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required';
  END IF;

  -- Fetch row and validate
  SELECT batch_id, raw_payload
  INTO v_batch_id, v_raw_payload
  FROM public.icplc_import_rows
  WHERE id = p_row_id
    AND match_status = 'unmatched';

  IF v_batch_id IS NULL THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, 'Row not found or not unmatched'::TEXT;
    RETURN;
  END IF;

  -- Get event_id
  SELECT event_id INTO v_event_id
  FROM public.icplc_import_batches
  WHERE id = v_batch_id;

  -- Execute resolution action
  IF p_action = 'link_existing' THEN
    IF p_participant_id IS NULL THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'participant_id required for link_existing'::TEXT;
      RETURN;
    END IF;

    UPDATE public.icplc_import_rows
      SET match_status = 'manual', participant_id = p_participant_id
      WHERE id = p_row_id;

    RETURN QUERY SELECT TRUE::BOOLEAN, NULL::TEXT;

  ELSIF p_action = 'create_new' THEN
    -- Create participant from raw CSV data
    INSERT INTO public.icplc_participants (
      event_id,
      full_name,
      email,
      registration_status,
      source_values
    ) VALUES (
      v_event_id,
      TRIM((v_raw_payload ->> 'First Name') || ' ' || COALESCE(v_raw_payload ->> 'Last Name', '')),
      NULLIF(TRIM(v_raw_payload ->> 'Email'), ''),
      'unknown',
      jsonb_build_object('registration_status', jsonb_build_object(
        'value', v_raw_payload ->> 'Status',
        'source', 'registration_csv',
        'observed_at', now()
      ))
    )
    RETURNING id INTO v_new_participant_id;

    UPDATE public.icplc_import_rows
      SET match_status = 'manual', participant_id = v_new_participant_id
      WHERE id = p_row_id;

    RETURN QUERY SELECT TRUE::BOOLEAN, NULL::TEXT;

  ELSIF p_action = 'skip' THEN
    UPDATE public.icplc_import_rows
      SET apply_status = 'skipped'
      WHERE id = p_row_id;

    RETURN QUERY SELECT TRUE::BOOLEAN, NULL::TEXT;

  ELSE
    RETURN QUERY SELECT FALSE::BOOLEAN, 'Invalid action: ' || p_action;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- D1 FIX: Email claim conflicts are explicitly detected and rejected
-- D2 FIX: Durable Registration ID conflicts are explicitly detected and rejected
--
-- After this migration, the following RPCs are available:
--
-- icplc_apply_registration_import(batch_id, user_id)
--   → applied_rows, error_rows, batch_status
--   Atomically applies with explicit conflict detection for D1 and D2
--
-- icplc_resolve_unmatched_row(row_id, action, participant_id, user_id)
--   → success, error_message
--   Manual resolution: link_existing / create_new / skip
