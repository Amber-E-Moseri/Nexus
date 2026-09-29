-- Add mapped_payload column to icplc_import_rows for fuzzy matching support
-- Stores header-mapped canonical field names alongside raw CSV data
-- Fixes matching RPC to work with original CSV headers

-- Add mapped_payload column to store header-mapped fields
ALTER TABLE public.icplc_import_rows
  ADD COLUMN IF NOT EXISTS mapped_payload jsonb default '{}';

-- Create index for matching performance
CREATE INDEX IF NOT EXISTS icplc_import_rows_mapped_email_idx
  ON public.icplc_import_rows USING GIN (mapped_payload);

-- Update icplc_match_import_rows to use mapped_payload instead of raw_payload
-- This fixes the fuzzy matching logic which expects canonical field names
CREATE OR REPLACE FUNCTION public.icplc_match_import_rows(p_batch_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row RECORD;
  v_match_id UUID;
  v_match_status TEXT;
  v_event_id UUID;
  v_matched INT := 0;
  v_unmatched INT := 0;
  v_name_candidates INT;
BEGIN
  -- Authorization: caller must have write capability for ICPLC participants
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

    -- 1. Persistent identity map (highest priority; staff-confirmed)
    SELECT participant_id INTO v_match_id
    FROM public.icplc_identity_maps
    WHERE event_id = v_event_id
      AND source_type = 'csv'
      AND source_key = v_row.identity_key
    LIMIT 1;

    IF v_match_id IS NOT NULL THEN
      v_match_status := 'persistent';
    ELSE
      -- 2. KingsChat Username exact match (use mapped_payload first, fallback to raw)
      DECLARE
        v_kingschat_username TEXT :=
          COALESCE(
            v_row.mapped_payload->>'kingschat_username',
            v_row.raw_payload->>'KingsChat Username',
            v_row.raw_payload->>'KingsChat Handle',
            v_row.raw_payload->>'kingsChatHandle'
          );
      BEGIN
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
      END;

      -- 3. Email exact match (use mapped_payload first, fallback to raw)
      IF v_match_id IS NULL THEN
        DECLARE
          v_email TEXT :=
            COALESCE(
              v_row.mapped_payload->>'email',
              v_row.raw_payload->>'Email',
              v_row.raw_payload->>'Email Address'
            );
        BEGIN
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
        END;
      END IF;

      -- 3b. Email fuzzy match (trigram similarity > 0.6)
      IF v_match_id IS NULL THEN
        DECLARE
          v_email TEXT :=
            COALESCE(
              v_row.mapped_payload->>'email',
              v_row.raw_payload->>'Email',
              v_row.raw_payload->>'Email Address'
            );
        BEGIN
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
        END;
      END IF;

      -- 4. Normalized full-name match (only auto-match when exactly one candidate)
      IF v_match_id IS NULL THEN
        DECLARE
          v_full_name TEXT :=
            COALESCE(
              v_row.mapped_payload->>'full_name',
              v_row.raw_payload->>'Full Name',
              v_row.raw_payload->>'Name'
            );
        BEGIN
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
        END;
      END IF;

      -- 4b. Name fuzzy match (trigram similarity > 0.6)
      IF v_match_id IS NULL THEN
        DECLARE
          v_full_name TEXT :=
            COALESCE(
              v_row.mapped_payload->>'full_name',
              v_row.raw_payload->>'Full Name',
              v_row.raw_payload->>'Name'
            );
        BEGIN
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
        END;
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
$$;
