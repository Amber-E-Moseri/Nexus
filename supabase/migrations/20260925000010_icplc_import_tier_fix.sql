-- ICPLC Authorization Correction: import tier enforcement
--
-- DEFECT: icplc_can_write_participants() returns TRUE for Accommodation/Hospitality
-- team members, granting them INSERT/UPDATE/DELETE on icplc_participants and full
-- access to the import pipeline. The approved permission matrix excludes those teams
-- from all write and import operations.
--
-- FIX (three changes):
--   A. Update icplc_can_write_participants() to also exclude Accommodation/Hospitality.
--   B. Introduce icplc_can_import() as a semantically distinct import-pipeline capability
--      (same V1 membership rules; kept separate for future tier divergence).
--   C. Rebind all import-related table policies and RPC guards from
--      icplc_can_write_participants() → icplc_can_import().
--
-- icplc_import_batches_read is rebind from icplc_can_read_participants() →
-- icplc_can_import() because import batch metadata belongs to the import subsystem.
-- Participant read access must not implicitly expose import batch metadata.
--
-- This migration contains the full bodies of the three import RPCs, verbatim from
-- their originating migrations, with only the authorization guard identifier changed.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Correct icplc_can_write_participants()
-- Add Accommodation + Hospitality exclusions alongside existing Finance/Transportation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.icplc_can_write_participants()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s           on s.name ilike ec.sprint_pattern
        join public.sprint_teams st         on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. New icplc_can_import() — import-pipeline capability
-- V1 membership rules match the corrected write helper.
-- Kept separate so a future tier that can write participants (e.g. a sync account)
-- but must not batch-import can be introduced without conflating both capabilities.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.icplc_can_import()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s           on s.name ilike ec.sprint_pattern
        join public.sprint_teams st         on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;

revoke execute on function public.icplc_can_import() from anon, public;
grant  execute on function public.icplc_can_import() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Rebind import table policies → icplc_can_import()
--
-- icplc_import_batches: both read AND write policies use icplc_can_import().
-- Import batch metadata belongs to the import subsystem; participant-read permission
-- (icplc_can_read_participants) must not implicitly expose it.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "icplc_import_batches_read"  on public.icplc_import_batches;
drop policy if exists "icplc_import_batches_write" on public.icplc_import_batches;

create policy "icplc_import_batches_read" on public.icplc_import_batches
  for select to authenticated
  using (public.icplc_can_import());

create policy "icplc_import_batches_write" on public.icplc_import_batches
  for all to authenticated
  using (public.icplc_can_import())
  with check (public.icplc_can_import());

-- icplc_import_rows: SELECT gate and ALL gate both use icplc_can_import().
drop policy if exists "icplc_import_rows_write_tier_only" on public.icplc_import_rows;
drop policy if exists "icplc_import_rows_write"           on public.icplc_import_rows;

create policy "icplc_import_rows_write_tier_only" on public.icplc_import_rows
  for select to authenticated
  using (public.icplc_can_import());

create policy "icplc_import_rows_write" on public.icplc_import_rows
  for all to authenticated
  using (public.icplc_can_import())
  with check (public.icplc_can_import());

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Rebind RPC authorization guards → icplc_can_import()
--
-- Each function body is reproduced verbatim from its originating migration.
-- The ONLY change per function is the single authorization guard identifier.
-- ─────────────────────────────────────────────────────────────────────────────

-- icplc_match_import_rows (origin: 20260925000008_icplc_match_rpc.sql)
create or replace function public.icplc_match_import_rows(p_batch_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_row record;
  v_match_id uuid;
  v_match_status text;
  v_event_id uuid;
  v_matched int := 0;
  v_unmatched int := 0;
  v_name_candidates int;
begin
  -- Authorization: caller must have import capability
  if not public.icplc_can_import() then
    raise exception 'permission denied for function icplc_match_import_rows'
      using errcode = '42501';
  end if;

  update public.icplc_import_batches
  set status = 'matching'
  where id = p_batch_id and status in ('pending', 'matched');

  if not found then
    raise exception 'Batch % not found or not in a matchable state', p_batch_id
      using errcode = '22023';
  end if;

  select event_id into v_event_id
  from public.icplc_import_batches
  where id = p_batch_id;

  for v_row in
    select id, raw_payload, identity_key
    from public.icplc_import_rows
    where batch_id = p_batch_id
  loop
    v_match_id := null;
    v_match_status := 'unmatched';

    -- 1. Persistent identity map (highest priority; staff-confirmed)
    select participant_id into v_match_id
    from public.icplc_identity_maps
    where event_id = v_event_id
      and source_type = 'csv'
      and source_key = v_row.identity_key
    limit 1;

    if v_match_id is not null then
      v_match_status := 'persistent';
    else
      -- 2. Email exact match (unique per event; unambiguous by unique index)
      if (v_row.raw_payload->>'email') is not null
         and trim(v_row.raw_payload->>'email') <> ''
      then
        select id into v_match_id
        from public.icplc_participants
        where event_id = v_event_id
          and email is not null
          and lower(trim(email)) = lower(trim(v_row.raw_payload->>'email'))
        limit 1;

        if v_match_id is not null then
          v_match_status := 'auto';
        end if;
      end if;

      -- 3. Normalized full-name match — only auto-match when EXACTLY one candidate
      -- Multiple same-normalized-name candidates require manual resolution.
      -- Fuzzy (Levenshtein) suggestions are deferred to V2.
      if v_match_id is null
         and (v_row.raw_payload->>'full_name') is not null
         and trim(v_row.raw_payload->>'full_name') <> ''
      then
        select count(*) into v_name_candidates
        from public.icplc_participants
        where event_id = v_event_id
          and regexp_replace(lower(trim(full_name)), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(trim(v_row.raw_payload->>'full_name')), '[^a-z0-9]', '', 'g');

        if v_name_candidates = 1 then
          select id into v_match_id
          from public.icplc_participants
          where event_id = v_event_id
            and regexp_replace(lower(trim(full_name)), '[^a-z0-9]', '', 'g')
              = regexp_replace(lower(trim(v_row.raw_payload->>'full_name')), '[^a-z0-9]', '', 'g');
          v_match_status := 'auto';
        end if;
        -- v_name_candidates > 1: leave as 'unmatched'; staff resolves manually
      end if;
    end if;

    update public.icplc_import_rows
    set participant_id = v_match_id,
        match_status   = v_match_status
    where id = v_row.id;

    if v_match_id is not null then
      v_matched := v_matched + 1;
    else
      v_unmatched := v_unmatched + 1;
    end if;
  end loop;

  update public.icplc_import_batches
  set status         = 'matched',
      matched_rows   = v_matched,
      unmatched_rows = v_unmatched
  where id = p_batch_id;
end;
$$;

grant execute on function public.icplc_match_import_rows(uuid) to authenticated;
revoke execute on function public.icplc_match_import_rows(uuid) from public, anon;

-- icplc_preview_import (origin: 20260925000009_icplc_preview_rpc.sql)
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
  -- Authorization: caller must have import capability
  if not public.icplc_can_import() then
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

-- icplc_apply_import_row (origin: 20260925000009_icplc_preview_rpc.sql)
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
  -- Authorization: caller must have import capability
  if not public.icplc_can_import() then
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
