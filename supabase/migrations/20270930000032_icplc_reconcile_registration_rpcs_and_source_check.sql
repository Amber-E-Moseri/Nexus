-- Reconcile production with the certified ICPLC Registration import RPCs.
--
-- Production applied earlier working-copy versions of 20270929000001/2 (and the source-type constraint),
-- and those migration files were later hardened in place without a forward migration, so the ledger says
-- "applied" while the live definitions differ. Definitions below are copied verbatim from a database
-- rebuilt from the repository migration chain:
--   * icplc_parse_registration_csv / icplc_preview_registration_import: add the
--     icplc_can_write_participants() authorization check (SECURITY DEFINER, executable by anon)
--   * icplc_apply_registration_import: load the matched participant's override_fields so staff overrides
--     are protected (production initialised them as empty)
--   * icplc_match_registration_identity / icplc_match_import_rows: certified bodies
--   * icplc_identity_maps_source_type_check: include cmp_documentation (required by CMP sync)
-- Signatures, security mode and search_path are unchanged (CREATE OR REPLACE keeps them).
--
-- GRANTS (deliberate change): icplc_can_write_participants() returns NULL, not false, for callers with no
-- auth.uid() (anon), so `IF NOT icplc_can_write_participants()` never raises for them and the inline check
-- alone does not stop anonymous callers. The sibling import RPCs (icplc_match_import_rows, icplc_preview_import,
-- icplc_apply_import_row) are protected because anon has no EXECUTE; the four Registration RPCs below are
-- brought in line with that pattern: EXECUTE is revoked from PUBLIC/anon and kept for authenticated (which the
-- inline check then gates) and service_role.

CREATE OR REPLACE FUNCTION public.icplc_apply_registration_import(p_batch_id uuid, p_applied_by uuid)
 RETURNS TABLE(applied_rows integer, error_rows integer, batch_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND COALESCE(apply_status, '') NOT IN ('error', 'skipped')
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
      ELSIF v_row.match_status in ('auto', 'manual', 'persistent', 'auto_kingschat', 'auto_fuzzy_email', 'auto_fuzzy_name') AND v_participant_id IS NOT NULL THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.icplc_match_import_rows(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_row RECORD;
  v_match_id UUID;
  v_match_status TEXT;
  v_event_id UUID;
  v_matched INT := 0;
  v_unmatched INT := 0;
  v_name_candidates INT;
  v_kingschat_username TEXT;
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  IF NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'permission denied for function icplc_match_import_rows'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.icplc_import_batches
  SET status = 'matching'
  WHERE id = p_batch_id AND status IN ('pending', 'matched');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found or not in a matchable state', p_batch_id
      USING ERRCODE = '22023';
  END IF;

  SELECT event_id INTO v_event_id
  FROM public.icplc_import_batches
  WHERE id = p_batch_id;

  FOR v_row IN
    SELECT id, raw_payload, mapped_payload, identity_key
    FROM public.icplc_import_rows
    WHERE batch_id = p_batch_id
  LOOP
    v_match_id := NULL;
    v_match_status := 'unmatched';

    -- 1. Persistent identity map
    SELECT participant_id INTO v_match_id
    FROM public.icplc_identity_maps
    WHERE event_id = v_event_id
      AND source_type = 'csv'
      AND source_key = v_row.identity_key
    LIMIT 1;

    IF v_match_id IS NOT NULL THEN
      v_match_status := 'persistent';
    ELSE
      -- 2. KingsChat exact match
      v_kingschat_username := COALESCE(
        v_row.raw_payload->>'KingsChat Username',
        v_row.raw_payload->>'KingsChat Handle',
        v_row.raw_payload->>'KingsChat User ID',
        v_row.raw_payload->>'kingsChatHandle'
      );

      IF v_kingschat_username IS NOT NULL AND TRIM(v_kingschat_username) <> '' THEN
        SELECT id INTO v_match_id
        FROM public.icplc_participants
        WHERE event_id = v_event_id
          AND kingschat_username IS NOT NULL
          AND LOWER(TRIM(kingschat_username)) = LOWER(TRIM(v_kingschat_username))
        LIMIT 1;

        IF v_match_id IS NOT NULL THEN
          v_match_status := 'auto_kingschat';
        END IF;
      END IF;

      -- 3. Email exact match
      IF v_match_id IS NULL THEN
        v_email := COALESCE(
          v_row.raw_payload->>'Email',
          v_row.raw_payload->>'Email Address'
        );

        IF v_email IS NOT NULL AND TRIM(v_email) <> '' THEN
          SELECT id INTO v_match_id
          FROM public.icplc_participants
          WHERE event_id = v_event_id
            AND email IS NOT NULL
            AND LOWER(TRIM(email)) = LOWER(TRIM(v_email))
          LIMIT 1;

          IF v_match_id IS NOT NULL THEN
            v_match_status := 'auto';
          END IF;
        END IF;
      END IF;

      -- 3b. Email fuzzy match
      IF v_match_id IS NULL THEN
        v_email := COALESCE(
          v_row.raw_payload->>'Email',
          v_row.raw_payload->>'Email Address'
        );

        IF v_email IS NOT NULL AND TRIM(v_email) <> '' THEN
          SELECT id INTO v_match_id
          FROM public.icplc_participants
          WHERE event_id = v_event_id
            AND email IS NOT NULL
            AND similarity(LOWER(TRIM(email)), LOWER(TRIM(v_email))) > 0.6
          ORDER BY similarity(LOWER(TRIM(email)), LOWER(TRIM(v_email))) DESC
          LIMIT 1;

          IF v_match_id IS NOT NULL THEN
            v_match_status := 'auto_fuzzy_email';
          END IF;
        END IF;
      END IF;

      -- 4. Normalized full-name match
      IF v_match_id IS NULL THEN
        v_full_name := COALESCE(
          v_row.raw_payload->>'Full Name',
          v_row.raw_payload->>'Name'
        );

        IF v_full_name IS NOT NULL AND TRIM(v_full_name) <> '' THEN
          SELECT COUNT(*) INTO v_name_candidates
          FROM public.icplc_participants
          WHERE event_id = v_event_id
            AND REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]', '', 'g')
              = REGEXP_REPLACE(LOWER(TRIM(v_full_name)), '[^a-z0-9]', '', 'g');

          IF v_name_candidates = 1 THEN
            SELECT id INTO v_match_id
            FROM public.icplc_participants
            WHERE event_id = v_event_id
              AND REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]', '', 'g')
                = REGEXP_REPLACE(LOWER(TRIM(v_full_name)), '[^a-z0-9]', '', 'g');
            v_match_status := 'auto';
          END IF;
        END IF;
      END IF;

      -- 4b. Name fuzzy match
      IF v_match_id IS NULL THEN
        v_full_name := COALESCE(
          v_row.raw_payload->>'Full Name',
          v_row.raw_payload->>'Name'
        );

        IF v_full_name IS NOT NULL AND TRIM(v_full_name) <> '' THEN
          SELECT id INTO v_match_id
          FROM public.icplc_participants
          WHERE event_id = v_event_id
            AND full_name IS NOT NULL
            AND similarity(LOWER(TRIM(full_name)), LOWER(TRIM(v_full_name))) > 0.6
          ORDER BY similarity(LOWER(TRIM(full_name)), LOWER(TRIM(v_full_name))) DESC
          LIMIT 1;

          IF v_match_id IS NOT NULL THEN
            v_match_status := 'auto_fuzzy_name';
          END IF;
        END IF;
      END IF;
    END IF;

    UPDATE public.icplc_import_rows
    SET participant_id = v_match_id,
        match_status = v_match_status
    WHERE id = v_row.id;

    IF v_match_id IS NOT NULL THEN
      v_matched := v_matched + 1;
    ELSE
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  UPDATE public.icplc_import_batches
  SET status = 'matched',
      matched_rows = v_matched,
      unmatched_rows = v_unmatched
  WHERE id = p_batch_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.icplc_match_registration_identity(p_event_id uuid, p_raw_payload jsonb)
 RETURNS TABLE(participant_id uuid, match_status text, candidate_ids uuid[], reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_registration_id TEXT;
  v_email TEXT;
  v_normalized_email TEXT;
  v_participant_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_candidates UUID[] := ARRAY[]::UUID[];
  v_reason TEXT;
BEGIN
  -- Step 1: Durable Registration ID map (definitive)
  v_registration_id := NULLIF(TRIM(p_raw_payload ->> 'Registration ID'), '');

  IF v_registration_id IS NOT NULL THEN
    SELECT icplc_identity_maps.participant_id INTO v_participant_id
    FROM public.icplc_identity_maps
    WHERE icplc_identity_maps.event_id = p_event_id
      AND icplc_identity_maps.source_type = 'registration_csv'
      AND icplc_identity_maps.source_key = v_registration_id
    LIMIT 1;

    IF v_participant_id IS NOT NULL THEN
      RETURN QUERY SELECT
        v_participant_id,
        'auto'::TEXT,
        ARRAY[]::UUID[],
        'Durable registration_csv identity map matched'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Step 2: KingsChat User ID (DISABLED IN V1 — namespace not yet proven)
  -- v_kingschat_id := NULLIF(TRIM(p_raw_payload ->> 'KingsChat User ID'), '');
  -- (Deferred until namespace authority is established)

  -- Step 3: Exact normalized email claim (definitive)
  v_email := NULLIF(TRIM(p_raw_payload ->> 'Email'), '');

  IF v_email IS NOT NULL THEN
    v_normalized_email := public.normalize_email(v_email);

    SELECT icplc_email_claims.participant_id INTO v_participant_id
    FROM public.icplc_email_claims
    WHERE icplc_email_claims.event_id = p_event_id
      AND icplc_email_claims.normalized_email = v_normalized_email
    LIMIT 1;

    IF v_participant_id IS NOT NULL THEN
      RETURN QUERY SELECT
        v_participant_id,
        'auto'::TEXT,
        ARRAY[]::UUID[],
        'Exact email claim matched'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Step 4: Name + organization candidates (for staff review, no auto-link)
  -- Extract name parts
  SELECT extract_name_parts.first_name, extract_name_parts.last_name
  INTO v_first_name, v_last_name
  FROM public.extract_name_parts(p_raw_payload ->> 'First Name' || ' ' || COALESCE(p_raw_payload ->> 'Last Name', ''));

  IF v_first_name IS NOT NULL THEN
    -- Candidates: same subgroup (if provided in CSV)
    -- This is advisory only; matching is based on name similarity + organization
    -- No auto-link; requires staff confirmation

    SELECT ARRAY_AGG(DISTINCT p.id) INTO v_candidates
    FROM public.icplc_participants p
    WHERE p.event_id = p_event_id
      AND (
        LOWER(p.full_name) ILIKE '%' || LOWER(v_first_name) || '%'
      );

    IF array_length(v_candidates, 1) > 0 THEN
      RETURN QUERY SELECT
        NULL::UUID,
        'unmatched'::TEXT,
        v_candidates,
        'Name candidates found; staff review required'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Step 5: No useful evidence (unmatched)
  RETURN QUERY SELECT
    NULL::UUID,
    'unmatched'::TEXT,
    ARRAY[]::UUID[],
    'No definitive identity evidence'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.icplc_parse_registration_csv(p_event_id uuid, p_csv_text text, p_imported_by uuid)
 RETURNS TABLE(batch_id uuid, total_rows integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id UUID;
  v_lines TEXT[];
  v_header_line TEXT;
  v_header_fields TEXT[];
  v_header_map JSONB := '{}'::JSONB;
  v_row_number INT := 0;
  v_line TEXT;
  v_fields TEXT[];
  v_raw_payload JSONB;
  v_registration_id TEXT;
  v_total_rows INT := 0;
  v_error_detail TEXT;
  v_registration_ids TEXT[] := ARRAY[]::TEXT[];
  v_col_idx INT;
  v_field_name TEXT;
  v_field_value TEXT;
  v_expected_headers TEXT[] := ARRAY[
    'Registration ID', 'Title', 'First Name', 'Last Name', 'Email',
    'Country Code', 'Phone Number', 'KingsChat User ID', 'KingsChat Username',
    'KingsChat Phone', 'Country', 'Region', 'Zone', 'Group',
    'Fellowship/Church', 'Designation', 'Status', 'Registration Date', 'Registered'
  ];
BEGIN
  -- AUTHORIZATION CHECK: import parsing mutates import batch/row state.
  IF auth.role() <> 'service_role' AND NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required';
  END IF;

  -- Create the import batch
  v_batch_id := gen_random_uuid();
  INSERT INTO public.icplc_import_batches (
    id, event_id, source, source_identifier, status, imported_by, total_rows, created_at
  ) VALUES (
    v_batch_id, p_event_id, 'registration_csv', NULL, 'pending', p_imported_by, 0, now()
  );

  -- Split CSV into lines
  v_lines := string_to_array(p_csv_text, E'\n');

  IF array_length(v_lines, 1) < 2 THEN
    RETURN QUERY SELECT v_batch_id, 0, 'CSV must have at least a header row'::TEXT;
    RETURN;
  END IF;

  -- Parse header (first line)
  v_header_line := v_lines[1];
  v_header_fields := string_to_array(v_header_line, ',');

  -- Build header map: normalize field names
  FOR v_col_idx IN 1..array_length(v_header_fields, 1) LOOP
    v_field_name := TRIM(v_header_fields[v_col_idx]);
    v_header_map := v_header_map || jsonb_build_object(v_field_name, v_col_idx);
  END LOOP;

  -- Validate all expected headers exist
  FOR v_field_name IN SELECT UNNEST(v_expected_headers) LOOP
    IF NOT v_header_map ? v_field_name THEN
      RETURN QUERY SELECT v_batch_id, 0, 'Missing required column: ' || v_field_name;
      RETURN;
    END IF;
  END LOOP;

  -- Parse data rows (skip empty rows)
  FOR v_row_number IN 2..array_length(v_lines, 1) LOOP
    v_line := TRIM(v_lines[v_row_number]);

    -- Skip empty lines
    IF v_line = '' THEN
      CONTINUE;
    END IF;

    v_fields := string_to_array(v_line, ',');
    v_raw_payload := '{}'::JSONB;

    -- Extract all columns into raw_payload
    FOR v_field_name IN SELECT jsonb_object_keys(v_header_map) LOOP
      v_col_idx := (v_header_map ->> v_field_name)::INT;
      v_field_value := CASE
        WHEN v_col_idx <= array_length(v_fields, 1)
        THEN TRIM(v_fields[v_col_idx])
        ELSE NULL
      END;
      v_raw_payload := v_raw_payload || jsonb_build_object(v_field_name, v_field_value);
    END LOOP;

    -- Extract Registration ID for duplicate check
    v_registration_id := NULLIF(TRIM(v_raw_payload ->> 'Registration ID'), '');

    -- Track nonblank Registration IDs for duplicate detection
    IF v_registration_id IS NOT NULL THEN
      IF v_registration_id = ANY(v_registration_ids) THEN
        v_error_detail := 'Duplicate Registration ID: ' || v_registration_id;
        INSERT INTO public.icplc_import_rows (
          batch_id, row_number, raw_payload, match_status, apply_status, error_detail
        ) VALUES (
          v_batch_id, v_row_number, v_raw_payload, 'error', 'error', v_error_detail
        );
        CONTINUE;
      END IF;
      v_registration_ids := array_append(v_registration_ids, v_registration_id);
    END IF;

    -- Create import row
    INSERT INTO public.icplc_import_rows (
      batch_id, row_number, raw_payload, match_status, apply_status
    ) VALUES (
      v_batch_id, v_row_number, v_raw_payload, 'unmatched', NULL
    );

    v_total_rows := v_total_rows + 1;
  END LOOP;

  -- Update batch with row count
  UPDATE public.icplc_import_batches
    SET total_rows = v_total_rows, status = 'matching'
    WHERE id = v_batch_id;

  RETURN QUERY SELECT v_batch_id, v_total_rows, NULL::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.icplc_preview_registration_import(p_batch_id uuid)
 RETURNS TABLE(previewed_rows integer, unmatched_rows integer, error_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id UUID;
  v_row RECORD;
  v_participant_id UUID;
  v_match_status TEXT;
  v_candidates UUID[];
  v_reason TEXT;
  v_changes_preview JSONB;
  v_total_unmatched INT := 0;
  v_total_error INT := 0;
BEGIN
  -- AUTHORIZATION CHECK: preview mutates import row decisions and batch status.
  IF auth.role() <> 'service_role' AND NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required';
  END IF;

  -- Get event_id from batch
  SELECT event_id INTO v_event_id
  FROM public.icplc_import_batches
  WHERE id = p_batch_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Batch not found: %', p_batch_id;
  END IF;

  -- Process each row in batch
  FOR v_row IN
    SELECT id, row_number, raw_payload, match_status
    FROM public.icplc_import_rows
    WHERE batch_id = p_batch_id
    ORDER BY row_number
  LOOP
    -- Skip rows already errored
    IF v_row.match_status = 'error' THEN
      v_total_error := v_total_error + 1;
      CONTINUE;
    END IF;

    -- Run identity matching
    SELECT participant_id, match_status, candidate_ids, reason
    INTO v_participant_id, v_match_status, v_candidates, v_reason
    FROM public.icplc_match_registration_identity(v_event_id, v_row.raw_payload);

    -- Build changes_preview based on match result
    v_changes_preview := jsonb_build_object(
      'match_status', v_match_status,
      'participant_id', v_participant_id,
      'candidates', v_candidates,
      'reason', v_reason
    );

    -- Update row with preview decision
    UPDATE public.icplc_import_rows
      SET
        match_status = v_match_status,
        participant_id = v_participant_id,
        changes_preview = v_changes_preview,
        apply_status = CASE
          WHEN v_match_status = 'error' THEN 'error'
          WHEN v_match_status = 'unmatched' THEN 'protected'
          ELSE 'updated'
        END
      WHERE id = v_row.id;

    -- Track counts
    IF v_match_status = 'unmatched' THEN
      v_total_unmatched := v_total_unmatched + 1;
    END IF;
  END LOOP;

  -- Update batch status
  UPDATE public.icplc_import_batches
    SET
      status = 'previewed',
      matched_rows = (SELECT COUNT(*) FROM public.icplc_import_rows WHERE batch_id = p_batch_id AND match_status in ('auto', 'manual', 'persistent', 'auto_kingschat', 'auto_fuzzy_email', 'auto_fuzzy_name')),
      unmatched_rows = v_total_unmatched,
      error_rows = v_total_error,
      preview_computed_at = now()
    WHERE id = p_batch_id;

  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM public.icplc_import_rows WHERE batch_id = p_batch_id AND apply_status IS NOT NULL)::INT,
    v_total_unmatched,
    v_total_error;
END;
$function$
;

ALTER TABLE public.icplc_identity_maps DROP CONSTRAINT IF EXISTS icplc_identity_maps_source_type_check;
ALTER TABLE public.icplc_identity_maps ADD CONSTRAINT icplc_identity_maps_source_type_check
  CHECK (source_type = ANY (ARRAY['csv'::text, 'cmp_registrations'::text, 'cmp_flights'::text, 'cmp_documentation'::text, 'registration'::text, 'registration_csv'::text]));

REVOKE EXECUTE ON FUNCTION public.icplc_parse_registration_csv(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.icplc_preview_registration_import(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.icplc_apply_registration_import(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.icplc_match_registration_identity(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.icplc_parse_registration_csv(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.icplc_preview_registration_import(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.icplc_apply_registration_import(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.icplc_match_registration_identity(uuid, jsonb) TO authenticated, service_role;
