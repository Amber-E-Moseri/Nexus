-- icplc_preview_import: server-side preview RPC
-- Evaluates field changes for each matched row against current DB state + override_fields.
-- Persists decisions in icplc_import_rows.changes_preview.
-- Does NOT mutate icplc_participants or source_values (provenance updated at Apply time).
-- Requires icplc_can_write_participants() for the caller.

create or replace function public.icplc_preview_import(p_batch_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_row        record;
  v_participant record;
  v_preview    jsonb;
  v_field      text;
  v_incoming   text;
  v_current    text;
  v_decision   text;
  v_mutable_fields text[] := array[
    'registration_status', 'passport_readiness', 'visa_process_status',
    'arrival_date', 'arrival_time', 'arrival_flight',
    'departure_date', 'departure_time', 'departure_flight'
  ];
begin
  -- Authorization: caller must have write capability
  if not public.icplc_can_write_participants() then
    raise exception 'permission denied for function icplc_preview_import'
      using errcode = '42501';
  end if;

  update public.icplc_import_batches
  set status = 'previewing'
  where id = p_batch_id and status = 'matched';

  if not found then
    raise exception 'Batch % not found or not in matched state', p_batch_id
      using errcode = '22023';
  end if;

  for v_row in
    select ir.id, ir.raw_payload, ir.participant_id
    from public.icplc_import_rows ir
    where ir.batch_id = p_batch_id
      and ir.match_status in ('auto', 'manual', 'persistent')
      and ir.participant_id is not null
  loop
    select * into v_participant
    from public.icplc_participants
    where id = v_row.participant_id;

    if not found then continue; end if;

    v_preview := '{}'::jsonb;

    foreach v_field in array v_mutable_fields loop
      v_incoming := v_row.raw_payload->>v_field;
      if v_incoming is null or v_incoming = '' then continue; end if;

      if (v_participant.override_fields->v_field->>'overridden')::boolean = true then
        v_decision := 'protected';
        v_current  := null;
      else
        v_current := case v_field
          when 'registration_status'  then v_participant.registration_status
          when 'passport_readiness'   then v_participant.passport_readiness
          when 'visa_process_status'  then v_participant.visa_process_status
          when 'arrival_date'         then v_participant.arrival_date::text
          when 'arrival_time'         then v_participant.arrival_time
          when 'arrival_flight'       then v_participant.arrival_flight
          when 'departure_date'       then v_participant.departure_date::text
          when 'departure_time'       then v_participant.departure_time
          when 'departure_flight'     then v_participant.departure_flight
          else null
        end;

        v_decision := case when v_current = v_incoming then 'no_change' else 'update' end;
      end if;

      v_preview := v_preview || jsonb_build_object(
        v_field, jsonb_build_object(
          'decision',       v_decision,
          'incoming_value', v_incoming,
          'current_value',  v_current,
          'source',         'csv'
        )
      );
    end loop;

    update public.icplc_import_rows
    set changes_preview = v_preview
    where id = v_row.id;
  end loop;

  update public.icplc_import_batches
  set status              = 'previewed',
      preview_computed_at = now()
  where id = p_batch_id;
end;
$$;

grant execute on function public.icplc_preview_import(uuid) to authenticated;
revoke execute on function public.icplc_preview_import(uuid) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- icplc_apply_import_row: atomic per-participant apply transaction
-- All field updates, source_values provenance, and activity_log insert happen
-- in a single PostgreSQL transaction for this participant.
-- Called by the icplc-import-apply edge function for each row.
-- Returns JSONB: { applied: int, protected: int, skipped: int, error: text? }
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.icplc_apply_import_row(
  p_row_id            uuid,
  p_batch_id          uuid,
  p_preview_computed_at timestamptz,
  p_actor_user_id     uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_row          record;
  v_participant  record;
  v_field        text;
  v_field_result record;
  v_decision     text;
  v_incoming     text;
  v_current      text;
  v_update_cols  text[] := array[]::text[];
  v_update_vals  jsonb  := '{}'::jsonb;
  v_source_vals  jsonb;
  v_applied_count int := 0;
  v_protected_count int := 0;
  v_skipped_count int := 0;
  v_dyn_sql      text;
  v_mutable_fields text[] := array[
    'registration_status', 'passport_readiness', 'visa_process_status',
    'arrival_date', 'arrival_time', 'arrival_flight',
    'departure_date', 'departure_time', 'departure_flight'
  ];
begin
  -- Authorization: caller must have write capability
  if not public.icplc_can_write_participants() then
    raise exception 'permission denied for function icplc_apply_import_row'
      using errcode = '42501';
  end if;

  -- Fetch import row
  select * into v_row
  from public.icplc_import_rows
  where id = p_row_id and batch_id = p_batch_id;

  if not found then
    return jsonb_build_object('error', 'row not found', 'applied', 0, 'protected', 0, 'skipped', 0);
  end if;

  if v_row.participant_id is null then
    return jsonb_build_object('error', 'row has no participant match', 'applied', 0, 'protected', 0, 'skipped', 0);
  end if;

  -- Re-fetch participant from DB at apply time (not preview snapshot)
  select * into v_participant
  from public.icplc_participants
  where id = v_row.participant_id;

  if not found then
    return jsonb_build_object('error', 'participant not found', 'applied', 0, 'protected', 0, 'skipped', 0);
  end if;

  v_source_vals := v_participant.source_values;

  foreach v_field in array v_mutable_fields loop
    -- Get the preview decision (server computed, not trusted from caller)
    if v_row.changes_preview->v_field is null then continue; end if;

    v_decision := v_row.changes_preview->v_field->>'decision';
    v_incoming := v_row.changes_preview->v_field->>'incoming_value';

    -- Re-check override at apply time — catches staff corrections after preview
    if (v_participant.override_fields->v_field->>'overridden')::boolean = true then
      v_protected_count := v_protected_count + 1;
      -- Still update source_values so the disagreement panel is accurate
      v_source_vals := jsonb_set(
        v_source_vals, array[v_field],
        jsonb_build_object(
          'value',       v_incoming,
          'source',      v_row.changes_preview->v_field->>'source',
          'observed_at', now(),
          'batch_id',    p_batch_id
        )
      );
      continue;
    end if;

    -- If participant was updated after preview was computed and current value changed, skip
    if v_participant.updated_at > p_preview_computed_at then
      v_current := case v_field
        when 'registration_status'  then v_participant.registration_status
        when 'passport_readiness'   then v_participant.passport_readiness
        when 'visa_process_status'  then v_participant.visa_process_status
        when 'arrival_date'         then v_participant.arrival_date::text
        when 'arrival_time'         then v_participant.arrival_time
        when 'arrival_flight'       then v_participant.arrival_flight
        when 'departure_date'       then v_participant.departure_date::text
        when 'departure_time'       then v_participant.departure_time
        when 'departure_flight'     then v_participant.departure_flight
        else null
      end;
      -- If current value differs from what preview saw, skip to protect concurrent edits
      if v_current <> (v_row.changes_preview->v_field->>'current_value')
         or (v_current is null) <> ((v_row.changes_preview->v_field->>'current_value') is null)
      then
        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;
    end if;

    if v_decision = 'update' then
      v_update_vals := v_update_vals || jsonb_build_object(v_field, v_incoming);
      v_applied_count := v_applied_count + 1;
    elsif v_decision = 'no_change' then
      v_skipped_count := v_skipped_count + 1;
    end if;

    -- Update source_values provenance for all mutable fields (including no_change)
    v_source_vals := jsonb_set(
      v_source_vals, array[v_field],
      jsonb_build_object(
        'value',       v_incoming,
        'source',      v_row.changes_preview->v_field->>'source',
        'observed_at', now(),
        'batch_id',    p_batch_id
      )
    );
  end loop;

  -- Apply all field changes + source_values in one UPDATE (atomic)
  if v_applied_count > 0 then
    -- Build dynamic UPDATE for changed fields
    -- We use jsonb overlay approach: merge update_vals into participant record
    update public.icplc_participants
    set
      registration_status  = coalesce((v_update_vals->>'registration_status')::text, registration_status),
      passport_readiness   = coalesce((v_update_vals->>'passport_readiness')::text, passport_readiness),
      visa_process_status  = coalesce((v_update_vals->>'visa_process_status')::text, visa_process_status),
      arrival_date         = coalesce((v_update_vals->>'arrival_date')::date, arrival_date),
      arrival_time         = coalesce(v_update_vals->>'arrival_time', arrival_time),
      arrival_flight       = coalesce(v_update_vals->>'arrival_flight', arrival_flight),
      departure_date       = coalesce((v_update_vals->>'departure_date')::date, departure_date),
      departure_time       = coalesce(v_update_vals->>'departure_time', departure_time),
      departure_flight     = coalesce(v_update_vals->>'departure_flight', departure_flight),
      source_values        = v_source_vals
    where id = v_row.participant_id;
  else
    -- No field changes, but still update source_values provenance
    update public.icplc_participants
    set source_values = v_source_vals
    where id = v_row.participant_id;
  end if;

  -- Insert activity_log entry
  insert into public.activity_log (user_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_user_id,
    case when v_applied_count > 0 then 'import_applied' else 'import_no_change' end,
    'icplc_participant',
    v_row.participant_id,
    jsonb_build_object(
      'batch_id',        p_batch_id,
      'row_id',          p_row_id,
      'applied_count',   v_applied_count,
      'protected_count', v_protected_count,
      'skipped_count',   v_skipped_count
    )
  );

  -- Mark row apply status
  update public.icplc_import_rows
  set apply_status = case
    when v_applied_count > 0 then 'updated'
    when v_protected_count > 0 then 'protected'
    else 'kept'
  end
  where id = p_row_id;

  return jsonb_build_object(
    'applied',    v_applied_count,
    'protected',  v_protected_count,
    'skipped',    v_skipped_count
  );
exception when others then
  -- Log error on row
  update public.icplc_import_rows
  set apply_status  = 'error',
      error_detail  = sqlerrm
  where id = p_row_id;

  return jsonb_build_object(
    'error',      sqlerrm,
    'applied',    0,
    'protected',  0,
    'skipped',    0
  );
end;
$$;

grant execute on function public.icplc_apply_import_row(uuid, uuid, timestamptz, uuid) to authenticated;
revoke execute on function public.icplc_apply_import_row(uuid, uuid, timestamptz, uuid) from public, anon;
