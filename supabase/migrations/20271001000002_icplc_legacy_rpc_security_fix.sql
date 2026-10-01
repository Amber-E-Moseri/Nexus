-- ICPLC Legacy Registration RPC Security Fix — P0 Hotfix
--
-- Three independent defects confirmed in icplc_apply_registration_csv_row
-- and icplc_apply_registration_csv_batch (committed in 20270926000000):
--
--   1. EXECUTE EXPOSURE — neither RPC was included in the PUBLIC/anon revoke
--      sweep performed by 20270930000032 for the four newer Registration RPCs.
--      Default PostgreSQL PUBLIC EXECUTE grant was never removed.
--
--   2. NULL AUTHORIZATION FAILURE — both RPCs used:
--        IF NOT public.icplc_can_write_participants() THEN ...
--      For unauthenticated callers icplc_can_write_participants() returns NULL
--      (not false), because auth.uid() is NULL and the SQL expression
--      `NULL IN ('super_admin', ...)` evaluates to NULL, not FALSE.
--      `NOT NULL` is NULL; `IF NULL THEN` never executes in PL/pgSQL.
--      The authorization guard was silently bypassed for anon callers.
--
--   3. MASS-UPDATE PRECEDENCE BUG — icplc_apply_registration_csv_row
--      contained (in the LINK_EXISTING branch):
--        WHERE id = v_row.resolved_participant_id
--          AND registration_status != 'registered'
--           OR v_registered_value = 'Yes'
--      SQL AND binds before OR; when Registered='Yes' the condition collapsed
--      to OR TRUE, removing the id restriction and updating ALL participants
--      across all events. The UPDATE had no event_id scope. SECURITY DEFINER
--      context meant RLS on icplc_participants did not contain the blast.
--
-- FIX STRATEGY (forward-migration only; historical migrations unchanged):
--   A. Revoke PUBLIC/anon EXECUTE from both functions.
--   B. Replace `IF NOT <nullable>` with `IF <nullable> IS NOT TRUE` (null-safe
--      fail-closed) in both functions.
--   C. Fix the UPDATE predicate: add event_id scope, parenthesize the OR,
--      and use COALESCE for NULL-safe registration_status comparison.
--   D. Re-grant EXECUTE to authenticated and service_role only.
--
-- IMPORTANT: this migration does NOT redesign the import system or change any
-- other semantic behavior. The batch function is also re-issued solely for
-- the auth guard fix; its logic is otherwise unchanged.

-- ============================================================================
-- STEP 1: Revoke EXECUTE from PUBLIC and anon before redefining the functions
-- ============================================================================
-- Revoke first so that during the window between REVOKE and the function
-- replacement there is no callable version with the old body.

REVOKE EXECUTE ON FUNCTION public.icplc_apply_registration_csv_row(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.icplc_apply_registration_csv_batch(UUID, UUID, UUID)
  FROM PUBLIC, anon;

-- ============================================================================
-- STEP 2: Replace icplc_apply_registration_csv_row with all three fixes
-- ============================================================================

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
  -- FIX B: IS NOT TRUE is null-safe; guards against NULL from the helper when
  -- auth.uid() is absent. service_role is explicitly exempted (it has no JWT
  -- sub claim, so the helper also returns NULL for it; the grant layer is the
  -- principal protection for anon, the body guard covers authenticated users).
  if auth.role() <> 'service_role' and public.icplc_can_write_participants() IS NOT TRUE then
    raise exception 'permission denied for icplc_apply_registration_csv_row'
      using errcode = '42501';
  end if;

  -- Validate row/batch/event coherence before any mutation.
  -- FIX D: both checks are required; neither is sufficient alone.
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

  -- RESOLUTION: SKIP
  if v_row.resolution = 'skip' then
    update public.icplc_import_rows
    set apply_status = 'skipped'
    where id = p_row_id;
    return jsonb_build_object('skipped', true);
  end if;

  -- RESOLUTION: CREATE_NEW
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

  -- RESOLUTION: LINK_EXISTING
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

    -- Update registration_status if Registered=Yes and not overridden
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

    -- FIX C: event_id scope prevents cross-event updates; parenthesized OR
    -- restores the intended precedence; COALESCE handles NULL registration_status
    -- (NULL status treated as non-registered, so source_values is written).
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

-- ============================================================================
-- STEP 3: Replace icplc_apply_registration_csv_batch — auth guard fix only
-- ============================================================================

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
  -- FIX B: IS NOT TRUE is null-safe. service_role exempt (same rationale as
  -- icplc_apply_registration_csv_row above: service_role has auth.uid()=NULL,
  -- so the helper returns NULL for it too; anon is blocked at the grant layer).
  if auth.role() <> 'service_role' and public.icplc_can_write_participants() IS NOT TRUE then
    raise exception 'permission denied for icplc_apply_registration_csv_batch'
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

-- ============================================================================
-- STEP 4: Re-grant EXECUTE to intended roles only
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.icplc_apply_registration_csv_row(UUID, UUID, UUID, UUID)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.icplc_apply_registration_csv_batch(UUID, UUID, UUID)
  TO authenticated, service_role;
