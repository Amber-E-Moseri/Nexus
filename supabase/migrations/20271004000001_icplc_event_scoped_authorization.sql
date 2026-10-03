-- ICPLC: event-scoped authorization (F2)
--
-- PROBLEM (proven against the real policy/function SQL, see src/tests/icplc/eventScopedAuthorization.test.js)
--   icplc_can_read_participants(), icplc_can_write_participants(), icplc_can_import() and icplc_is_sprint_member()
--   answer "is the caller on ANY ICPLC-named event's sprint?". They take no event, so a policy or RPC guard built on
--   them authorizes by membership in event A and then applies that decision to rows of event B:
--     * a member of the ICPLC 27 sprint could read every ICPLC 26 participant;
--     * a Registration-team member of ICPLC 26 could UPDATE ICPLC 27 participants;
--     * a Group Pastor of one event could read every row of another event (their GP scoping is evaluated per row's
--       event, and the unscoped direct-sprint-member arm admitted them to the other event's rows).
--
-- FIX
--   Every participant authorization decision is evaluated for the ROW'S OWN event_id, using the sprint(s) that event
--   resolves to (event_configs.sprint_pattern ILIKE sprints.name, the existing event<->sprint link).
--
--   Membership is evaluated as a SET. A person may belong to many teams in the same sprint, or to none:
--   "allowed" means EXISTS some qualifying team membership, so team order never matters and a person who is in an
--   excluded team AND an allowed team keeps the access the allowed team grants. Nothing here reads
--   sprint_members.sprint_team_id (the legacy single-team pointer) and nothing assumes one team per person.
--
--   The rules themselves are unchanged from 20270930000031 / 20271003000001 / 20271003000002; only their scope is.
--   Role- and department-based access (super_admin, regional_secretary, Programs department) is platform-wide by
--   design and is not event-dependent.
--
--   The zero-argument helpers are left in place for any caller not yet migrated; they now mean "ICPLC member of any
--   event" and must not be used for a row-level decision.
--
-- HISTORICAL NOTE -- superseded by 20271004000004_event_configs_explicit_sprint_id.sql
--   This migration originally resolves an event to its sprint(s) by name pattern
--   (event_configs.sprint_pattern ILIKE sprints.name), because no explicit link existed when it was written.
--   That resolution is replaced by migration 20271004000004, which adds the nullable foreign key
--   event_configs.sprint_id and redefines icplc_event_sprint_ids() to resolve ONLY through it (NULL fails closed;
--   sprint_pattern no longer takes part in authorization). Everything below is kept as originally written so that
--   migration history stays truthful; the effective, final event -> sprint authority is event_configs.sprint_id.
--
--   The pattern-overlap limitation this migration originally documented (two events whose patterns match the same
--   sprint sharing its membership) no longer applies once 20271004000004 is applied.
--
-- No data is read or written by this migration.

-- ── Event -> sprint resolution ──────────────────────────────────────────────────────────────────────────────
create or replace function public.icplc_event_sprint_ids(p_event_id uuid)
  returns setof uuid language sql security definer stable
  set search_path = public, pg_catalog as $$
    select s.id
    from public.event_configs ec
    join public.sprints s on s.name ilike ec.sprint_pattern
    where ec.id = p_event_id
      and ec.event_name ilike '%ICPLC%'
  $$;

-- Does the caller hold at least one team membership in this event's sprint(s), whatever the team? (set semantics)
create or replace function public.icplc_has_event_team_membership(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select auth.uid() is not null and p_event_id is not null and exists (
      select 1
      from public.sprint_teams st
      join public.sprint_team_members stm on stm.team_id = st.id
      where st.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
        and stm.user_id = auth.uid()
    )
  $$;

-- ── Event-scoped overloads (same rules as the zero-argument versions, evaluated for one event) ───────────────
create or replace function public.icplc_is_sprint_member(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select auth.uid() is not null and p_event_id is not null and exists (
      select 1
      from public.sprint_members sm
      where sm.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
        and sm.user_id = auth.uid()
    )
  $$;

create or replace function public.icplc_can_read_participants(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select p_event_id is not null and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.sprint_teams st
        join public.sprint_team_members stm on stm.team_id = st.id
        where st.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
      )
    )
  $$;

create or replace function public.icplc_can_write_participants(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select p_event_id is not null and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.sprint_teams st
        join public.sprint_team_members stm on stm.team_id = st.id
        where st.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;

create or replace function public.icplc_can_import(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select p_event_id is not null and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.sprint_teams st
        join public.sprint_team_members stm on stm.team_id = st.id
        where st.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;

revoke execute on function public.icplc_event_sprint_ids(uuid)          from anon, public;
revoke execute on function public.icplc_has_event_team_membership(uuid) from anon, public;
revoke execute on function public.icplc_is_sprint_member(uuid)          from anon, public;
revoke execute on function public.icplc_can_read_participants(uuid)     from anon, public;
revoke execute on function public.icplc_can_write_participants(uuid)    from anon, public;
revoke execute on function public.icplc_can_import(uuid)                from anon, public;
grant  execute on function public.icplc_event_sprint_ids(uuid)          to authenticated;
grant  execute on function public.icplc_has_event_team_membership(uuid) to authenticated;
grant  execute on function public.icplc_is_sprint_member(uuid)          to authenticated;
grant  execute on function public.icplc_can_read_participants(uuid)     to authenticated;
grant  execute on function public.icplc_can_write_participants(uuid)    to authenticated;
grant  execute on function public.icplc_can_import(uuid)                to authenticated;

-- ── Policies: decide per ROW'S event ─────────────────────────────────────────────────────────────────────────
-- icplc_participants
drop policy if exists icplc_participants_read on public.icplc_participants;
create policy icplc_participants_read on public.icplc_participants
  for select to authenticated
  using (
    public.icplc_can_read_participants(event_id)
    or (public.icplc_is_sprint_member(event_id) and public.icplc_gp_is_authorized(event_id) is not true)
    or (public.icplc_gp_is_authorized(event_id) and subgroup = public.icplc_gp_subgroup(event_id))
  );

drop policy if exists icplc_participants_insert on public.icplc_participants;
create policy icplc_participants_insert on public.icplc_participants
  for insert to authenticated
  with check (public.icplc_can_write_participants(event_id) and public.icplc_gp_is_authorized(event_id) is not true);

drop policy if exists icplc_participants_update on public.icplc_participants;
create policy icplc_participants_update on public.icplc_participants
  for update to authenticated
  using      (public.icplc_can_write_participants(event_id) and public.icplc_gp_is_authorized(event_id) is not true)
  with check (public.icplc_can_write_participants(event_id) and public.icplc_gp_is_authorized(event_id) is not true);

-- icplc_participant_tags (event comes from the participant)
drop policy if exists icplc_participant_tags_read on public.icplc_participant_tags;
create policy icplc_participant_tags_read on public.icplc_participant_tags
  for select to authenticated
  using (exists (
    select 1 from public.icplc_participants p
    where p.id = participant_id
      and (
        public.icplc_can_read_participants(p.event_id)
        or (public.icplc_gp_is_authorized(p.event_id) and p.subgroup = public.icplc_gp_subgroup(p.event_id))
      )
  ));

drop policy if exists icplc_participant_tags_write on public.icplc_participant_tags;
create policy icplc_participant_tags_write on public.icplc_participant_tags
  for all to authenticated
  using (exists (
    select 1 from public.icplc_participants p
    where p.id = participant_id
      and public.icplc_can_write_participants(p.event_id)
      and public.icplc_gp_is_authorized(p.event_id) is not true
  ))
  with check (exists (
    select 1 from public.icplc_participants p
    where p.id = participant_id
      and public.icplc_can_write_participants(p.event_id)
      and public.icplc_gp_is_authorized(p.event_id) is not true
  ));

-- icplc_tags: event_id null = org-wide default tag, readable by any ICPLC reader
drop policy if exists icplc_tags_read on public.icplc_tags;
create policy icplc_tags_read on public.icplc_tags
  for select to authenticated
  using (
    (event_id is not null and public.icplc_can_read_participants(event_id))
    or (event_id is null and public.icplc_can_read_participants())
  );

-- icplc_identity_maps
drop policy if exists icplc_identity_maps_read on public.icplc_identity_maps;
create policy icplc_identity_maps_read on public.icplc_identity_maps
  for select to authenticated
  using (public.icplc_can_read_participants(event_id));

drop policy if exists icplc_identity_maps_write on public.icplc_identity_maps;
create policy icplc_identity_maps_write on public.icplc_identity_maps
  for all to authenticated
  using      (public.icplc_can_write_participants(event_id))
  with check (public.icplc_can_write_participants(event_id));

-- icplc_import_batches / icplc_import_rows (rows take their event from the batch)
drop policy if exists icplc_import_batches_read on public.icplc_import_batches;
create policy icplc_import_batches_read on public.icplc_import_batches
  for select to authenticated
  using (public.icplc_can_import(event_id));

drop policy if exists icplc_import_batches_write on public.icplc_import_batches;
create policy icplc_import_batches_write on public.icplc_import_batches
  for all to authenticated
  using      (public.icplc_can_import(event_id))
  with check (public.icplc_can_import(event_id));

drop policy if exists icplc_import_rows_read on public.icplc_import_rows;
create policy icplc_import_rows_read on public.icplc_import_rows
  for select to authenticated
  using (exists (select 1 from public.icplc_import_batches b where b.id = batch_id and public.icplc_can_write_participants(b.event_id)));

drop policy if exists icplc_import_rows_write on public.icplc_import_rows;
create policy icplc_import_rows_write on public.icplc_import_rows
  for all to authenticated
  using      (exists (select 1 from public.icplc_import_batches b where b.id = batch_id and public.icplc_can_import(b.event_id)))
  with check (exists (select 1 from public.icplc_import_batches b where b.id = batch_id and public.icplc_can_import(b.event_id)));

drop policy if exists icplc_import_rows_write_tier_only on public.icplc_import_rows;
create policy icplc_import_rows_write_tier_only on public.icplc_import_rows
  for select to authenticated
  using (exists (select 1 from public.icplc_import_batches b where b.id = batch_id and public.icplc_can_import(b.event_id)));

-- icplc_email_claims (event from the participant)
drop policy if exists icplc_email_claims_select on public.icplc_email_claims;
create policy icplc_email_claims_select on public.icplc_email_claims
  for select to authenticated
  using (exists (select 1 from public.icplc_participants p where p.id = participant_id and public.icplc_can_read_participants(p.event_id)));

-- activity_log rows about participants (event from the participant)
drop policy if exists activity_log_icplc_participant on public.activity_log;
create policy activity_log_icplc_participant on public.activity_log
  for select to authenticated
  using (
    entity_type = 'icplc_participant'
    and exists (select 1 from public.icplc_participants p where p.id = entity_id and public.icplc_can_read_participants(p.event_id))
  );

-- communication_email_templates scoped to an ICPLC event
drop policy if exists email_templates_select on public.communication_email_templates;
create policy email_templates_select on public.communication_email_templates
  for select to authenticated
  using (event_config_id is null or public.icplc_can_read_participants(event_config_id));

-- ── SECURITY DEFINER RPCs: guard evaluated for the target event ──────────────────────────────────────────────
-- These bypass RLS, so their in-function guard is the only authorization. Each body below is the latest definition
-- verbatim except the guard call, which now names the event (the p_event_id argument, or the batch's event).
-- If the batch does not exist the event is NULL and the guard fails closed.

-- icplc_apply_import_row: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20260925000010_icplc_import_tier_fix.sql.
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
  if not public.icplc_can_import((select b.event_id from public.icplc_import_batches b where b.id = p_batch_id)) then
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

-- icplc_apply_registration_csv_batch: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20271003000001_icplc_group_pastor_authorization.sql.
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
  if auth.role() <> 'service_role' and public.icplc_can_write_participants(p_event_id) IS NOT TRUE then
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

-- icplc_apply_registration_csv_row: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20271003000001_icplc_group_pastor_authorization.sql.
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
  if auth.role() <> 'service_role' and public.icplc_can_write_participants(p_event_id) IS NOT TRUE then
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

-- icplc_apply_registration_import: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20270930000032_icplc_reconcile_registration_rpcs_and_source_check.sql.
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
  IF NOT public.icplc_can_write_participants((select b.event_id from public.icplc_import_batches b where b.id = p_batch_id)) THEN
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

-- icplc_match_import_rows: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20271003000001_icplc_group_pastor_authorization.sql.
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
  IF public.icplc_can_write_participants((select b.event_id from public.icplc_import_batches b where b.id = p_batch_id)) IS NOT TRUE THEN
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

-- icplc_parse_registration_csv: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20270930000032_icplc_reconcile_registration_rpcs_and_source_check.sql.
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
  IF auth.role() <> 'service_role' AND NOT public.icplc_can_write_participants(p_event_id) THEN
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

-- icplc_preview_import: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20260925000010_icplc_import_tier_fix.sql.
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
  if not public.icplc_can_import((select b.event_id from public.icplc_import_batches b where b.id = p_batch_id)) then
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

-- icplc_preview_registration_import: guard now evaluated for the target event (was event-agnostic). Body otherwise identical to 20270930000032_icplc_reconcile_registration_rpcs_and_source_check.sql.
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
  IF auth.role() <> 'service_role' AND NOT public.icplc_can_write_participants((select b.event_id from public.icplc_import_batches b where b.id = p_batch_id)) THEN
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
