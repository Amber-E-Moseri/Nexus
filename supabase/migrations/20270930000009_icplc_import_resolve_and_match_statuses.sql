-- 1. The matcher now emits auto_kingschat / auto_fuzzy_email / auto_fuzzy_name (allowed by
--    20270930000004), but the preview/apply/count functions only treat
--    auto|manual|persistent as "matched". Widen those lists in place so those rows are
--    previewed and applied like any other match.
DO $$
DECLARE
  r RECORD;
  pat CONSTANT text := 'in \(''auto'', ''manual'', ''persistent''\)';
  rep CONSTANT text := 'in (''auto'', ''manual'', ''persistent'', ''auto_kingschat'', ''auto_fuzzy_email'', ''auto_fuzzy_name'')';
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'icplc\_%'
      AND p.prosrc ~* pat
  LOOP
    EXECUTE regexp_replace(pg_get_functiondef(r.oid), pat, rep, 'gi');
  END LOOP;
END;
$$;

-- 2. Manual resolution of an unmatched import row.
--    create_new now builds the name from first/last (or full name), and keeps the
--    KingsChat handle, campus and subgroup so the new Working List entry is complete.
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
  v_raw JSONB;
  v_new_participant_id UUID;
  v_name TEXT;
  v_subgroup TEXT;
BEGIN
  IF NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required';
  END IF;

  SELECT batch_id, raw_payload
  INTO v_batch_id, v_raw
  FROM public.icplc_import_rows
  WHERE id = p_row_id
    AND match_status = 'unmatched';

  IF v_batch_id IS NULL THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, 'Row not found or not unmatched'::TEXT;
    RETURN;
  END IF;

  SELECT event_id INTO v_event_id
  FROM public.icplc_import_batches
  WHERE id = v_batch_id;

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
    v_name := COALESCE(
      NULLIF(TRIM(COALESCE(v_raw ->> 'Full Name', v_raw ->> 'Name')), ''),
      NULLIF(TRIM(COALESCE(v_raw ->> 'First Name', '') || ' ' || COALESCE(v_raw ->> 'Last Name', '')), '')
    );
    IF v_name IS NULL THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, 'Row has no name to create a participant from'::TEXT;
      RETURN;
    END IF;

    -- "BLW CENTRAL EAST SUBGROUP A" -> "BLW Central East Subgroup A"
    v_subgroup := NULLIF(TRIM(COALESCE(v_raw ->> 'Subgroup', v_raw ->> 'Group')), '');
    IF v_subgroup IS NOT NULL THEN
      v_subgroup := replace(initcap(lower(v_subgroup)), 'Blw ', 'BLW ');
    END IF;

    INSERT INTO public.icplc_participants (
      event_id, full_name, email, kingschat_username, region, subgroup,
      registration_status, participation_status, source_values
    ) VALUES (
      v_event_id,
      v_name,
      NULLIF(LOWER(TRIM(v_raw ->> 'Email')), ''),
      NULLIF(TRIM(v_raw ->> 'KingsChat Username'), ''),
      NULLIF(TRIM(COALESCE(v_raw ->> 'Fellowship/Church', v_raw ->> 'Region')), ''),
      v_subgroup,
      'unknown',
      'tracking',
      jsonb_build_object(
        'created_from', jsonb_build_object('source', 'registration_csv', 'observed_at', now()),
        'registration_status', jsonb_build_object(
          'value', v_raw ->> 'Status',
          'source', 'registration_csv',
          'observed_at', now()
        )
      )
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
