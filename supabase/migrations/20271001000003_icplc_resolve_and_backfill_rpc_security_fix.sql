-- ICPLC RPC Security Closure — Follow-on to P0 Hotfix 20271001000002
--
-- This migration closes the remaining RPC security findings identified during the
-- post-P0 sweep. Three functions are addressed:
--
--   F-1. icplc_resolve_unmatched_row (20270930000009)
--        ANON-EXECUTABLE MUTATION RISK
--        — No REVOKE was ever issued; PUBLIC EXECUTE default remained in place.
--        — Guard: `IF NOT icplc_can_write_participants()` — nullable; bypassed for anon
--          because the helper returns NULL (not false) when auth.uid() is NULL.
--        — Mutations: inserts icplc_participants (create_new), updates icplc_import_rows
--          (link_existing, skip).
--
--   F-2. icplc_match_import_rows (20270930000032, originally 20260925000008)
--        AUTHENTICATED-ONLY BUT GUARD DEFECT
--        — REVOKE FROM PUBLIC, anon was issued in the original definition
--          (20260925000008:158) and persists through CREATE OR REPLACE. Anon is
--          already blocked at the grant layer; the function is NOT anon-executable.
--        — Guard defect: `IF NOT icplc_can_write_participants()` — nullable, same
--          root cause. For authenticated non-admins the helper returns FALSE (not NULL)
--          so the defect is moot in practice. Hardened here for consistency.
--        — No REVOKE/GRANT changes needed.
--
--   F-3. icplc_backfill_participants_from_import (20270930000012)
--        ANON-EXECUTABLE MUTATION RISK
--        — GRANT TO authenticated was issued but PUBLIC was never explicitly revoked;
--          default PUBLIC EXECUTE remained in place. (The internal _icplc_backfill_from_import
--          was properly locked; only the public-facing wrapper was exposed.)
--        — Guard: `IF NOT icplc_can_write_participants()` — same nullable defect.
--        — Mutations: bulk UPDATE on icplc_participants (fill-only, non-destructive,
--          but still an anon-accessible write path under SECURITY DEFINER).
--
-- FIX STRATEGY:
--   A. REVOKE EXECUTE FROM PUBLIC, anon for F-1 and F-3 (grant layer closure).
--   B. Replace `IF NOT <nullable>` with `IF <nullable> IS NOT TRUE` in all three
--      (null-safe fail-closed guard). No service_role exemption — none of these
--      functions are called from edge functions or service-role contexts; all callers
--      are authenticated frontend users.
--   C. GRANT EXECUTE TO authenticated for F-1 and F-3 (F-3 already had this GRANT;
--      included explicitly to document intended state). F-2 unchanged.
--
-- IMPORTANT: this migration does NOT redesign import behavior, change identity
-- matching semantics, or modify any other functions.

-- ============================================================================
-- STEP 1: Revoke PUBLIC/anon EXECUTE before redefining F-1 and F-3
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.icplc_resolve_unmatched_row(UUID, TEXT, UUID, UUID)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.icplc_backfill_participants_from_import(UUID)
  FROM PUBLIC, anon;

-- ============================================================================
-- STEP 2: Replace icplc_resolve_unmatched_row (F-1)
-- ============================================================================
-- Body is identical to 20270930000009 except:
--   - `IF NOT icplc_can_write_participants()` → `IF icplc_can_write_participants() IS NOT TRUE`

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
  -- FIX: IS NOT TRUE is null-safe. For anon callers the helper returns NULL (not false);
  -- `NOT NULL` = NULL; the old `IF NOT` guard never executed. IS NOT TRUE closes that.
  -- No service_role exemption: this function is called only by authenticated frontend users.
  IF public.icplc_can_write_participants() IS NOT TRUE THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required'
      USING ERRCODE = '42501';
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

-- ============================================================================
-- STEP 3: Replace icplc_match_import_rows (F-2) — guard hardening only
-- ============================================================================
-- REVOKE/GRANT unchanged: the original 20260925000008 issued
--   GRANT TO authenticated + REVOKE FROM PUBLIC, anon
-- CREATE OR REPLACE preserves existing grants; those grants remain.
-- Only change: nullable guard → IS NOT TRUE.

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
  -- FIX: IS NOT TRUE is null-safe. For anon callers the helper returns NULL (not false).
  -- Anon is also blocked at the grant layer (REVOKE in 20260925000008), so this is belt-
  -- and-suspenders for authenticated non-admin callers.
  -- No service_role exemption: not a service_role call path.
  IF public.icplc_can_write_participants() IS NOT TRUE THEN
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
$function$;

-- ============================================================================
-- STEP 4: Replace icplc_backfill_participants_from_import (F-3)
-- ============================================================================
-- Only the public-facing wrapper changes; _icplc_backfill_from_import (the
-- internal function) already has REVOKE ALL FROM PUBLIC, anon, authenticated
-- and does not need to be touched.

CREATE OR REPLACE FUNCTION public.icplc_backfill_participants_from_import(p_batch_id UUID DEFAULT NULL)
RETURNS INT AS $$
BEGIN
  -- FIX: IS NOT TRUE is null-safe (same pattern as F-1 / F-2 above).
  -- No service_role exemption: not a service_role call path.
  IF public.icplc_can_write_participants() IS NOT TRUE THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required'
      USING ERRCODE = '42501';
  END IF;
  RETURN public._icplc_backfill_from_import(p_batch_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- STEP 5: Grant EXECUTE to intended roles only (F-1 and F-3)
-- ============================================================================
-- F-2 (icplc_match_import_rows) already has the correct grants from
-- 20260925000008; no change required.

GRANT EXECUTE ON FUNCTION public.icplc_resolve_unmatched_row(UUID, TEXT, UUID, UUID)
  TO authenticated;

-- icplc_backfill_participants_from_import already had GRANT TO authenticated
-- from 20270930000012; re-issued here to make the intended state explicit after
-- the PUBLIC REVOKE.
GRANT EXECUTE ON FUNCTION public.icplc_backfill_participants_from_import(UUID)
  TO authenticated;
