-- ICPLC Registration CSV Adapter
-- Adds V1 CSV source reconciliation to canonical registration architecture
--
-- Schema: extends icplc_import_rows with resolution tracking
-- RPCs: icplc_apply_registration_csv_batch, icplc_apply_registration_csv_row
-- Semantics: CSV source_type='csv', source_key=row_id (immutable)

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema: icplc_import_rows resolution tracking
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.icplc_import_rows
  ADD COLUMN IF NOT EXISTS resolution TEXT
    CHECK (resolution IN ('link_existing', 'create_new', 'skip')),
  ADD COLUMN IF NOT EXISTS resolved_participant_id UUID
    REFERENCES public.icplc_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS icplc_import_rows_resolved_participant_idx
  ON public.icplc_import_rows(resolved_participant_id)
  WHERE resolved_participant_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: Derive canonical registered status
-- Used by Overview, Working List filters, and Registered indicators
-- Recognizes BOTH registration table links AND positive CSV evidence
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.icplc_participant_is_registered(
  p_participant_id UUID,
  p_event_id UUID
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
declare
  v_participant record;
  v_has_registration_link boolean;
begin
  -- Check participant's registration_status field (CSV evidence + registration table)
  select registration_status into v_participant
  from public.icplc_participants
  where id = p_participant_id and event_id = p_event_id;

  if v_participant.registration_status = 'registered' then
    return true;
  end if;

  -- Check for canonical registration table links
  select exists(
    select 1
    from public.icplc_identity_maps
    where participant_id = p_participant_id
      and event_id = p_event_id
      and source_type = 'registration'
  ) into v_has_registration_link;

  return v_has_registration_link;
end;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_participant_is_registered(UUID, UUID)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: Apply CSV adapter batch
-- Processes all rows in batch with explicit resolutions
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Authorization: must have write capability
  if not public.icplc_can_write_participants() then
    raise exception 'permission denied for icplc_apply_registration_csv_batch'
      using errcode = '42501';
  end if;

  -- Verify batch exists and belongs to event
  select * into v_batch
  from public.icplc_import_batches
  where id = p_batch_id and event_id = p_event_id;

  if not found then
    raise exception 'batch % not found for event %', p_batch_id, p_event_id
      using errcode = '22023';
  end if;

  -- Process each row with resolution
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

  -- Update batch status
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
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: Apply individual CSV row
-- Handles: CREATE_NEW, LINK_EXISTING, SKIP resolutions
-- Enforces: immutable source mapping, Registered=No non-downgrade, email safety
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_result jsonb;
  v_source_values jsonb;
begin
  -- Authorization check
  if not public.icplc_can_write_participants() then
    return jsonb_build_object('error', 'permission denied');
  end if;

  -- Fetch row + batch
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

  -- Extract Registered value from raw_payload
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
    -- Create participant with evidence based on Registered value
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

    -- Create durable source mapping
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

    -- Verify participant exists and belongs to event
    select * into v_participant
    from public.icplc_participants
    where id = v_row.resolved_participant_id and event_id = p_event_id;

    if not found then
      return jsonb_build_object('error', 'participant not found in event');
    end if;

    -- Check for existing map: if exists and points to DIFFERENT participant, hard conflict
    select * into v_existing_map
    from public.icplc_identity_maps
    where event_id = p_event_id and source_type = 'csv' and source_key = v_source_key;

    if found and v_existing_map.participant_id != v_row.resolved_participant_id then
      return jsonb_build_object(
        'error',
        'source map conflict: row already mapped to different participant'
      );
    end if;

    -- Upsert source mapping (idempotent if same participant)
    insert into public.icplc_identity_maps(
      event_id, source_type, source_key, participant_id
    ) values (p_event_id, 'csv', v_source_key, v_row.resolved_participant_id)
    on conflict (event_id, source_type, source_key) do update
    set participant_id = excluded.participant_id
    where icplc_identity_maps.participant_id = excluded.participant_id;

    -- Update participant ONLY if Registered=Yes (never downgrade)
    if v_registered_value = 'Yes' then
      -- Set registration_status if not overridden
      if not (v_participant.override_fields->>'registration_status' is not null) then
        update public.icplc_participants
        set registration_status = 'registered'
        where id = v_row.resolved_participant_id;
      end if;
    else
      -- Registered=No: check for downgrade conflict
      if v_participant.registration_status = 'registered' then
        -- Record discrepancy in source_values
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
        where id = v_row.resolved_participant_id;
      end if;
    end if;

    -- Add/update CSV source values (for both Yes and No)
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
    and registration_status != 'registered' or v_registered_value = 'Yes';

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
  TO authenticated;
