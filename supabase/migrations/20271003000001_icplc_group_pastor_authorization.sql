-- ICPLC Group Pastor Authorization
--
-- Group Pastors are ICPLC sprint members whose participant row carries
-- leadership = 'Group Pastor'. They get READ-ONLY access scoped to their
-- own subgroup only. The database is the authoritative security boundary;
-- the frontend scopedSubgroup/onlySubgroup filter is UX-only.
--
-- CONFIRMED write gap (20270930000031):
--   icplc_can_write_participants() grants write to any sprint member whose team
--   name does not match Finance/Transportation/Accommodation/Hospitality.
--   Group Pastors belong to no named team and therefore satisfy this predicate.
--   All INSERT/UPDATE mutations and all import RPCs were reachable by a GP
--   directly via PostgREST or RPC call.
--
-- CHANGES IN THIS MIGRATION:
--   1. Two SECURITY DEFINER helper functions:
--        icplc_gp_is_authorized(event_id) → boolean   (fail-closed)
--        icplc_gp_subgroup(event_id)      → text
--   2. icplc_participants_read: add subgroup-scoped GP arm.
--   3. icplc_participants_insert/update: exclude GP callers.
--      (icplc_participants_delete is already super_admin/regional_secretary only.)
--   4. icplc_participant_tags_read: add subgroup-scoped GP arm.
--   5. icplc_participant_tags_write: exclude GP callers.
--   6. All participant mutation RPCs (SECURITY DEFINER): re-issued with GP guard.
--        icplc_apply_registration_csv_row
--        icplc_apply_registration_csv_batch
--        icplc_resolve_unmatched_row
--        icplc_match_import_rows
--        icplc_backfill_participants_from_import
-- Do not apply to production. Run the GP auth test suite before merge.

-- ============================================================================
-- PART 1: HELPER FUNCTIONS
-- ============================================================================

-- icplc_gp_is_authorized(p_event_id)
--
-- Returns TRUE iff the calling user has EXACTLY ONE icplc_participants row for
-- this event where:
--   - nexus_user_id = auth.uid()
--   - LOWER(leadership) = 'group pastor'
--   - subgroup IS NOT NULL AND btrim(subgroup) <> ''
--
-- All other states (0 rows, >1 rows, missing subgroup, NULL uid, DB error) →
-- returns FALSE. Never returns NULL. Fail-closed by design.
--
-- STABLE: PostgreSQL may cache the result per query when called with the same
-- p_event_id, which matters for row-level policy evaluation.

CREATE OR REPLACE FUNCTION public.icplc_gp_is_authorized(p_event_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_catalog
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      SELECT COUNT(*) = 1
      FROM public.icplc_participants
      WHERE event_id      = p_event_id
        AND nexus_user_id = auth.uid()
        AND LOWER(leadership) = 'group pastor'
        AND subgroup IS NOT NULL
        AND length(btrim(subgroup)) > 0
    )
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_gp_is_authorized(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.icplc_gp_is_authorized(uuid) TO authenticated;

-- icplc_gp_subgroup(p_event_id)
--
-- Returns the subgroup text the calling user is authorized to read, or NULL
-- when icplc_gp_is_authorized(p_event_id) is not TRUE.
-- Must only be used in conjunction with icplc_gp_is_authorized() = TRUE.

CREATE OR REPLACE FUNCTION public.icplc_gp_subgroup(p_event_id uuid)
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_catalog
AS $$
  SELECT subgroup
  FROM   public.icplc_participants
  WHERE  event_id      = p_event_id
    AND  nexus_user_id = auth.uid()
    AND  LOWER(leadership) = 'group pastor'
    AND  subgroup IS NOT NULL
    AND  length(btrim(subgroup)) > 0
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_gp_subgroup(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.icplc_gp_subgroup(uuid) TO authenticated;

-- icplc_gp_is_authorized_any()
--
-- Returns TRUE iff the caller is an authorized Group Pastor for ANY ICPLC event.
-- Used to guard RPCs that do not receive p_event_id directly.

CREATE OR REPLACE FUNCTION public.icplc_gp_is_authorized_any()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_catalog
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   public.icplc_participants p
      JOIN   public.event_configs ec ON ec.id = p.event_id
      WHERE  p.nexus_user_id = auth.uid()
        AND  ec.event_name ilike '%ICPLC%'
        AND  LOWER(p.leadership) = 'group pastor'
        AND  p.subgroup IS NOT NULL
        AND  length(btrim(p.subgroup)) > 0
    )
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_gp_is_authorized_any() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.icplc_gp_is_authorized_any() TO authenticated;

-- ============================================================================
-- PART 2: icplc_participants RLS POLICIES
-- ============================================================================

-- 2a. READ — add GP subgroup-scoped arm.
-- A row is visible if:
--   (a) the caller passes the existing full-access check, OR
--   (b) the caller is an authorized GP for this event AND the row's subgroup
--       equals the DB-derived authorized subgroup.
-- The client-requested subgroup has zero authority — PostgREST ?subgroup=eq.X
-- is a query filter applied AFTER this policy and cannot expand what the policy
-- would have returned.

DROP POLICY IF EXISTS icplc_participants_read ON public.icplc_participants;

CREATE POLICY icplc_participants_read
  ON public.icplc_participants
  FOR SELECT TO authenticated
  USING (
    public.icplc_can_read_participants()
    OR (
      public.icplc_gp_is_authorized(event_id)
      AND subgroup = public.icplc_gp_subgroup(event_id)
    )
  );

-- 2b. INSERT — exclude GP callers.
-- GP is read-only; they must not be able to create participant records even though
-- icplc_can_write_participants() returns TRUE for them.

DROP POLICY IF EXISTS icplc_participants_insert ON public.icplc_participants;

CREATE POLICY icplc_participants_insert
  ON public.icplc_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.icplc_can_write_participants()
    AND public.icplc_gp_is_authorized(event_id) IS NOT TRUE
  );

-- 2c. UPDATE — exclude GP callers.

DROP POLICY IF EXISTS icplc_participants_update ON public.icplc_participants;

CREATE POLICY icplc_participants_update
  ON public.icplc_participants
  FOR UPDATE TO authenticated
  USING (
    public.icplc_can_write_participants()
    AND public.icplc_gp_is_authorized(event_id) IS NOT TRUE
  )
  WITH CHECK (
    public.icplc_can_write_participants()
    AND public.icplc_gp_is_authorized(event_id) IS NOT TRUE
  );

-- (icplc_participants_delete already uses current_user_role() IN ('super_admin','regional_secretary')
-- which group pastors do not satisfy — no change needed.)

-- ============================================================================
-- PART 3: icplc_participant_tags RLS POLICIES
-- ============================================================================

-- 3a. READ — add GP scoped arm.
-- A tag row is visible if the underlying participant is visible to the caller.

DROP POLICY IF EXISTS icplc_participant_tags_read ON public.icplc_participant_tags;

CREATE POLICY icplc_participant_tags_read
  ON public.icplc_participant_tags
  FOR SELECT TO authenticated
  USING (
    public.icplc_can_read_participants()
    OR EXISTS (
      SELECT 1
      FROM   public.icplc_participants p
      WHERE  p.id          = participant_id
        AND  public.icplc_gp_is_authorized(p.event_id)
        AND  p.subgroup    = public.icplc_gp_subgroup(p.event_id)
    )
  );

-- 3b. WRITE (ALL) — exclude GP callers from all tag mutations.

DROP POLICY IF EXISTS icplc_participant_tags_write ON public.icplc_participant_tags;

CREATE POLICY icplc_participant_tags_write
  ON public.icplc_participant_tags
  FOR ALL TO authenticated
  USING (
    public.icplc_can_write_participants()
    AND NOT EXISTS (
      SELECT 1
      FROM   public.icplc_participants p
      WHERE  p.id = participant_id
        AND  public.icplc_gp_is_authorized(p.event_id) IS TRUE
    )
  )
  WITH CHECK (
    public.icplc_can_write_participants()
    AND NOT EXISTS (
      SELECT 1
      FROM   public.icplc_participants p
      WHERE  p.id = participant_id
        AND  public.icplc_gp_is_authorized(p.event_id) IS TRUE
    )
  );

-- ============================================================================
-- PART 4: IMPORT / MUTATION RPC GUARD
-- ============================================================================
-- Each SECURITY DEFINER import RPC bypasses table RLS. Group Pastors satisfy
-- icplc_can_write_participants() and could call these functions directly.
-- Re-issue each with a GP exclusion guard immediately after the existing auth check.
-- Function signatures and bodies are otherwise identical to the last re-issue
-- (20271001000002 / 20271001000003).

-- 4a. icplc_apply_registration_csv_row
-- ── Guard added: deny GP callers immediately after the write-participants check.

CREATE OR REPLACE FUNCTION public.icplc_apply_registration_csv_row(
  p_row_id UUID,
  p_batch_id UUID,
  p_event_id UUID,
  p_actor_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
declare
  v_row record;
  v_batch record;
  v_participant record;
  v_existing_map record;
  v_registered_value text;
  v_raw_email text;
  v_source_key text;
  v_new_participant_id uuid;
  v_source_values jsonb;
begin
  if auth.role() <> 'service_role' and public.icplc_can_write_participants() IS NOT TRUE then
    raise exception 'permission denied for icplc_apply_registration_csv_row'
      using errcode = '42501';
  end if;

  -- GP guard: group pastors satisfy icplc_can_write_participants() but are read-only.
  if public.icplc_gp_is_authorized(p_event_id) IS TRUE then
    raise exception 'permission denied: group pastors cannot perform import operations'
      using errcode = '42501';
  end if;

  select * into v_row
  from public.icplc_import_rows
  where id = p_row_id and batch_id = p_batch_id;

  if not found then
    return jsonb_build_object('error', 'row not found');
  end if;

  select * into v_batch
  from public.icplc_import_batches
  where id = p_batch_id and event_id = p_event_id;

  if not found then
    return jsonb_build_object('error', 'batch event_id mismatch');
  end if;

  v_registered_value := v_row.raw_payload->>'Registered';
  v_raw_email := v_row.raw_payload->>'Email';
  v_source_key := p_row_id::text;

  if v_row.resolution = 'skip' then
    update public.icplc_import_rows
    set apply_status = 'skipped'
    where id = p_row_id;
    return jsonb_build_object('skipped', true);
  end if;

  if v_row.resolution = 'create_new' then
    insert into public.icplc_participants(
      event_id, full_name, email, subgroup, registration_status, source_values, participation_status
    ) values (
      p_event_id,
      v_row.raw_payload->>'Name',
      v_raw_email,
      v_row.raw_payload->>'Subgroup',
      case when v_registered_value = 'Yes' then 'registered' else 'unknown' end,
      jsonb_build_object(
        'registration_csv', jsonb_build_object(
          'email', v_raw_email,
          'subgroup', v_row.raw_payload->>'Subgroup',
          'fellowship', v_row.raw_payload->>'Fellowship',
          'registered', v_registered_value,
          'status', v_row.raw_payload->>'Status',
          'batch_id', p_batch_id::text,
          'row_id', p_row_id::text,
          'applied_at', now()::text
        )
      ),
      'tracking'
    ) returning id into v_new_participant_id;

    insert into public.icplc_identity_maps(
      event_id, source_type, source_key, participant_id
    ) values (p_event_id, 'csv', v_source_key, v_new_participant_id)
    on conflict (event_id, source_type, source_key) do nothing;

    update public.icplc_import_rows
    set participant_id = v_new_participant_id,
        apply_status = 'created'
    where id = p_row_id;

    return jsonb_build_object('created', true, 'participant_id', v_new_participant_id);
  end if;

  if v_row.resolution = 'link_existing' then
    if v_row.resolved_participant_id is null then
      return jsonb_build_object('error', 'resolved_participant_id required for link_existing');
    end if;

    select * into v_participant
    from public.icplc_participants
    where id = v_row.resolved_participant_id and event_id = p_event_id;

    if not found then
      return jsonb_build_object('error', 'participant not found in event');
    end if;

    select * into v_existing_map
    from public.icplc_identity_maps
    where event_id = p_event_id and source_type = 'csv' and source_key = v_source_key;

    if found and v_existing_map.participant_id != v_row.resolved_participant_id then
      return jsonb_build_object(
        'error',
        'source map conflict: row already mapped to different participant'
      );
    end if;

    insert into public.icplc_identity_maps(
      event_id, source_type, source_key, participant_id
    ) values (p_event_id, 'csv', v_source_key, v_row.resolved_participant_id)
    on conflict (event_id, source_type, source_key) do update
    set participant_id = excluded.participant_id
    where icplc_identity_maps.participant_id = excluded.participant_id;

    if v_registered_value = 'Yes' then
      if not (v_participant.override_fields->>'registration_status' is not null) then
        update public.icplc_participants
        set registration_status = 'registered'
        where id = v_row.resolved_participant_id
          and event_id = p_event_id;
      end if;
    else
      if v_participant.registration_status = 'registered' then
        v_source_values := v_participant.source_values || jsonb_build_object(
          'registration_csv_conflict', jsonb_build_object(
            'csv_says', 'No',
            'participant_status', 'registered',
            'batch_id', p_batch_id::text,
            'observed_at', now()::text
          )
        );
        update public.icplc_participants
        set source_values = v_source_values
        where id = v_row.resolved_participant_id
          and event_id = p_event_id;
      end if;
    end if;

    v_source_values := coalesce(v_participant.source_values, '{}'::jsonb) || jsonb_build_object(
      'registration_csv', jsonb_build_object(
        'email', v_raw_email,
        'subgroup', v_row.raw_payload->>'Subgroup',
        'fellowship', v_row.raw_payload->>'Fellowship',
        'registered', v_registered_value,
        'status', v_row.raw_payload->>'Status',
        'batch_id', p_batch_id::text,
        'row_id', p_row_id::text,
        'applied_at', now()::text
      )
    );

    update public.icplc_participants
    set source_values = v_source_values
    where id = v_row.resolved_participant_id
      and event_id = p_event_id
      and (
        coalesce(registration_status, '') != 'registered'
        or v_registered_value = 'Yes'
      );

    update public.icplc_import_rows
    set participant_id = v_row.resolved_participant_id,
        apply_status = 'linked'
    where id = p_row_id;

    return jsonb_build_object('linked', true, 'participant_id', v_row.resolved_participant_id);
  end if;

  return jsonb_build_object('error', 'invalid resolution');

exception when others then
  return jsonb_build_object('error', sqlerrm);
end;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_apply_registration_csv_row(UUID, UUID, UUID, UUID)
  TO authenticated, service_role;

-- 4b. icplc_apply_registration_csv_batch

CREATE OR REPLACE FUNCTION public.icplc_apply_registration_csv_batch(
  p_batch_id UUID,
  p_event_id UUID,
  p_actor_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
declare
  v_row record;
  v_batch record;
  v_total_rows int := 0;
  v_created_count int := 0;
  v_linked_count int := 0;
  v_skipped_count int := 0;
  v_error_count int := 0;
  v_row_result jsonb;
  v_errors text[] := array[]::text[];
begin
  if auth.role() <> 'service_role' and public.icplc_can_write_participants() IS NOT TRUE then
    raise exception 'permission denied for icplc_apply_registration_csv_batch'
      using errcode = '42501';
  end if;

  -- GP guard
  if public.icplc_gp_is_authorized(p_event_id) IS TRUE then
    raise exception 'permission denied: group pastors cannot perform import operations'
      using errcode = '42501';
  end if;

  select * into v_batch
  from public.icplc_import_batches
  where id = p_batch_id and event_id = p_event_id;

  if not found then
    raise exception 'batch % not found for event %', p_batch_id, p_event_id
      using errcode = '22023';
  end if;

  for v_row in
    select *
    from public.icplc_import_rows
    where batch_id = p_batch_id
    order by row_number
  loop
    v_total_rows := v_total_rows + 1;

    if v_row.resolution is null then
      v_error_count := v_error_count + 1;
      v_errors := array_append(v_errors, 'Row ' || v_row.row_number || ': no resolution set');
      continue;
    end if;

    v_row_result := public.icplc_apply_registration_csv_row(
      v_row.id,
      p_batch_id,
      p_event_id,
      p_actor_user_id
    );

    if v_row_result->>'error' is not null then
      v_error_count := v_error_count + 1;
      v_errors := array_append(v_errors, 'Row ' || v_row.row_number || ': ' || v_row_result->>'error');
    elsif v_row_result->>'created' = 'true' then
      v_created_count := v_created_count + 1;
    elsif v_row_result->>'linked' = 'true' then
      v_linked_count := v_linked_count + 1;
    elsif v_row_result->>'skipped' = 'true' then
      v_skipped_count := v_skipped_count + 1;
    end if;
  end loop;

  update public.icplc_import_batches
  set status = case when v_error_count > 0 then 'applied_with_errors' else 'applied' end,
      preview_computed_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'total_rows', v_total_rows,
    'created', v_created_count,
    'linked', v_linked_count,
    'skipped', v_skipped_count,
    'errors', v_error_count,
    'error_details', v_errors
  );

exception when others then
  raise exception 'icplc_apply_registration_csv_batch failed: %', sqlerrm
    using errcode = '22023';
end;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_apply_registration_csv_batch(UUID, UUID, UUID)
  TO authenticated, service_role;

-- 4c. icplc_resolve_unmatched_row
-- Derives event_id from the batch; GP check uses that derived value.

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

  -- GP guard: uses event_id derived from the batch (not from client).
  IF public.icplc_gp_is_authorized(v_event_id) IS TRUE THEN
    RAISE EXCEPTION 'permission denied: group pastors cannot perform import operations'
      USING ERRCODE = '42501';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

GRANT EXECUTE ON FUNCTION public.icplc_resolve_unmatched_row(UUID, TEXT, UUID, UUID)
  TO authenticated;

-- 4d. icplc_match_import_rows
-- Derives event_id from the batch; GP check uses that derived value.

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

  -- GP guard: uses event_id derived from the batch.
  IF public.icplc_gp_is_authorized(v_event_id) IS TRUE THEN
    RAISE EXCEPTION 'permission denied: group pastors cannot perform import operations'
      USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT id, raw_payload, mapped_payload, identity_key
    FROM public.icplc_import_rows
    WHERE batch_id = p_batch_id
  LOOP
    v_match_id := NULL;
    v_match_status := 'unmatched';

    SELECT participant_id INTO v_match_id
    FROM public.icplc_identity_maps
    WHERE event_id = v_event_id
      AND source_type = 'csv'
      AND source_key = v_row.identity_key
    LIMIT 1;

    IF v_match_id IS NOT NULL THEN
      v_match_status := 'persistent';
    ELSE
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

-- 4e. icplc_backfill_participants_from_import
-- Thin wrapper; guard uses icplc_gp_is_authorized_any() since no event_id param.

CREATE OR REPLACE FUNCTION public.icplc_backfill_participants_from_import(p_batch_id UUID DEFAULT NULL)
RETURNS INT AS $$
BEGIN
  IF public.icplc_can_write_participants() IS NOT TRUE THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required'
      USING ERRCODE = '42501';
  END IF;
  -- GP guard: uses the any-event helper since p_batch_id alone doesn't give event_id cheaply.
  IF public.icplc_gp_is_authorized_any() IS TRUE THEN
    RAISE EXCEPTION 'permission denied: group pastors cannot perform import operations'
      USING ERRCODE = '42501';
  END IF;
  RETURN public._icplc_backfill_from_import(p_batch_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

GRANT EXECUTE ON FUNCTION public.icplc_backfill_participants_from_import(UUID)
  TO authenticated;
