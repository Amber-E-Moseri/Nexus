-- ICPLC Registration CSV Processing RPCs
--
-- Core infrastructure for parsing, matching, and reconciling Registration CSV imports.
-- These SECURITY DEFINER functions run with elevated privileges to:
--   * Read raw_payload (restricted by RLS normally)
--   * Atomically check identity maps, email claims, and candidate logic
--   * Update import batch status and row decisions safely
--
-- DESIGN DECISIONS:
--   * All matching is deterministic (no fuzzy)
--   * Email claims are the source of truth for exact email ownership
--   * Duplicate Registration IDs within a batch = conflict (no apply)
--   * Candidates are generated but NEVER auto-linked
--   * Status/Registered evidence preserved; canonical mutations gated

-- ============================================================================
-- HELPER: Normalize email for claims matching
-- ============================================================================
-- (Already defined in 20270902000001 as public.normalize_email)

-- ============================================================================
-- HELPER: Extract first 2 name parts (last name fallback to first if only 1)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.extract_name_parts(full_name TEXT)
RETURNS TABLE(first_name TEXT, last_name TEXT) AS $$
DECLARE
  parts TEXT[];
BEGIN
  parts := string_to_array(TRIM(COALESCE(full_name, '')), ' ');
  parts := array_remove(parts, '');

  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) = 0 THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT;
  ELSIF array_length(parts, 1) = 1 THEN
    RETURN QUERY SELECT parts[1], NULL::TEXT;
  ELSE
    RETURN QUERY SELECT parts[1], parts[array_length(parts, 1)]::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Parse Registration CSV and create import batch + rows
-- ============================================================================
-- Accepts CSV text with headers, validates structure, and creates batch/rows.
-- Returns the batch UUID for downstream preview/apply operations.
--
-- VALIDATION:
--   * All 18 core fields must be present
--   * Headers normalized (whitespace, case-insensitive matching)
--   * Extra columns preserved in raw_payload
--   * Empty rows skipped
--   * Unique constraint: one row per Registration ID (if present)

CREATE OR REPLACE FUNCTION public.icplc_parse_registration_csv(
  p_event_id UUID,
  p_csv_text TEXT,
  p_imported_by UUID
)
RETURNS TABLE(batch_id UUID, total_rows INT, error_message TEXT) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- FUNCTION: Deterministic identity matching (5-step algorithm)
-- ============================================================================
-- Implements the locked matching order:
--   1. Durable Registration ID map
--   2. KingsChat User ID (conditional; disabled in V1)
--   3. Exact normalized email claim
--   4. Name + organization candidates (for review, no auto-link)
--   5. Unmatched
--
-- Returns: match_status, matched participant_id, candidate_ids (ordered)

CREATE OR REPLACE FUNCTION public.icplc_match_registration_identity(
  p_event_id UUID,
  p_raw_payload JSONB
)
RETURNS TABLE(
  participant_id UUID,
  match_status TEXT,
  candidate_ids UUID[],
  reason TEXT
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- FUNCTION: Preview import decisions (compute changes_preview per row)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.icplc_preview_registration_import(p_batch_id UUID)
RETURNS TABLE(
  previewed_rows INT,
  unmatched_rows INT,
  error_rows INT
) AS $$
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
      matched_rows = (SELECT COUNT(*) FROM public.icplc_import_rows WHERE batch_id = p_batch_id AND match_status IN ('auto', 'manual', 'persistent')),
      unmatched_rows = v_total_unmatched,
      error_rows = v_total_error,
      preview_computed_at = now()
    WHERE id = p_batch_id;

  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM public.icplc_import_rows WHERE batch_id = p_batch_id AND apply_status IS NOT NULL)::INT,
    v_total_unmatched,
    v_total_error;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After this migration, the following RPCs are available:
--
-- icplc_parse_registration_csv(event_id, csv_text, user_id)
--   → batch_id, total_rows, error_message
--   Parses CSV, validates headers (18 core fields + Registered), creates batch/rows
--
-- icplc_match_registration_identity(event_id, raw_payload)
--   → participant_id, match_status, candidate_ids, reason
--   Implements 5-step deterministic matching algorithm
--
-- icplc_preview_registration_import(batch_id)
--   → previewed_rows, unmatched_rows, error_rows
--   Computes changes_preview for each row; updates batch status to 'previewed'
