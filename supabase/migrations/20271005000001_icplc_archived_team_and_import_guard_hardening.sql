-- ICPLC: archived teams no longer authorize; remaining any-event / pattern-based gates closed
--
-- 1. ARCHIVED TEAMS. sprint_teams.is_archived ("soft delete") was ignored by every ICPLC authorization decision, so a
--    person kept the access of a team that had been archived. Every team-derived decision now goes through ONE shared
--    helper, icplc_event_team_memberships(), which ignores archived teams (NULL is_archived = active).
--      * grants (read / write / import) come from ACTIVE teams only, as a set; no primary team, no ordering;
--      * icplc_has_event_team_membership() deliberately still counts ARCHIVED memberships: it is the marker that keeps a
--        person off the generic direct-sprint-member arm (F1). Archiving a restrictive team (e.g. Finance) therefore
--        never WIDENS anyone's access; a person left with only archived teams simply has no team-derived grant.
--      * memberships are never removed by archiving; unarchiving restores the grants.
--
-- 2. ZERO-ARGUMENT HELPERS. icplc_can_read_participants() / icplc_can_write_participants() / icplc_can_import() /
--    icplc_is_sprint_member() still resolved the sprint by name pattern (sprint_pattern ILIKE), i.e. the fuzzy
--    authority 20271004000004 removed from the event-scoped helpers. They now mean "authorized for at least one ICPLC
--    event" by delegating to the event-scoped helpers (explicit sprint_id, archived teams ignored).
--
-- 3. TWO SECURITY DEFINER RPCs F2 did not convert were gated only by the any-event helper:
--      icplc_resolve_unmatched_row(...)            -> a writer of event B could resolve/create inside event A's batch;
--      icplc_backfill_participants_from_import()   -> a writer of any event could backfill every event's participants.
--    Both are re-issued VERBATIM with an added event-scoped guard for the batch's own event (a NULL batch, which means
--    "all events", now requires a platform role). Rules for who may write are otherwise unchanged.
--
-- Not changed: row-level rules by team name (F4 territory), platform roles, the Programs department, Group Pastor rules.
-- No data is read or written by this migration.

create or replace function public.icplc_event_team_memberships(p_event_id uuid, p_include_archived boolean default false)
  returns table (team_id uuid, team_name text) language sql security definer stable
  set search_path = public, pg_catalog as $$
    select st.id, st.name
    from public.sprint_teams st
    join public.sprint_team_members stm on stm.team_id = st.id
    where p_event_id is not null
      and auth.uid() is not null
      and st.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
      and stm.user_id = auth.uid()
      and (p_include_archived or st.is_archived is not true)
  $$;

create or replace function public.icplc_has_event_team_membership(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select auth.uid() is not null and p_event_id is not null
      and exists (select 1 from public.icplc_event_team_memberships(p_event_id, true))
  $$;

create or replace function public.icplc_can_read_participants(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select p_event_id is not null and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1 from public.icplc_event_team_memberships(p_event_id) m
        where m.team_name not ilike '%Finance%'
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
        select 1 from public.icplc_event_team_memberships(p_event_id) m
        where m.team_name not ilike '%Finance%'
          and m.team_name not ilike '%Transportation%'
          and m.team_name not ilike '%Accommodation%'
          and m.team_name not ilike '%Hospitality%'
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
        select 1 from public.icplc_event_team_memberships(p_event_id) m
        where m.team_name not ilike '%Finance%'
          and m.team_name not ilike '%Transportation%'
          and m.team_name not ilike '%Accommodation%'
          and m.team_name not ilike '%Hospitality%'
      )
    )
  $$;

-- Zero-argument forms: "authorized for at least one ICPLC event". NULL for an unauthenticated caller is preserved
-- (callers test IS NOT TRUE).
create or replace function public.icplc_can_read_participants()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (select 1 from public.event_configs ec where ec.event_name ilike '%ICPLC%' and public.icplc_can_read_participants(ec.id))
    )
  $$;

create or replace function public.icplc_can_write_participants()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (select 1 from public.event_configs ec where ec.event_name ilike '%ICPLC%' and public.icplc_can_write_participants(ec.id))
    )
  $$;

create or replace function public.icplc_can_import()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (select 1 from public.event_configs ec where ec.event_name ilike '%ICPLC%' and public.icplc_can_import(ec.id))
    )
  $$;

create or replace function public.icplc_is_sprint_member()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select auth.uid() is not null and exists (
      select 1 from public.event_configs ec where ec.event_name ilike '%ICPLC%' and public.icplc_is_sprint_member(ec.id)
    )
  $$;

revoke execute on function public.icplc_event_team_memberships(uuid, boolean) from anon, public;
grant  execute on function public.icplc_event_team_memberships(uuid, boolean) to authenticated;

-- ── icplc_resolve_unmatched_row: event-scoped guard (otherwise verbatim) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.icplc_resolve_unmatched_row(p_row_id uuid, p_action text, p_participant_id uuid, p_resolved_by uuid)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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

  -- Event-scoped authorization for the row's OWN event (the any-event gate above is only a cheap first check).
  SELECT b.event_id INTO v_event_id
  FROM public.icplc_import_rows r
  JOIN public.icplc_import_batches b ON b.id = r.batch_id
  WHERE r.id = p_row_id;
  IF v_event_id IS NOT NULL AND public.icplc_can_write_participants(v_event_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required for this event'
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
$function$;

-- ── icplc_backfill_participants_from_import: event-scoped guard (otherwise verbatim) ────────────────────────
CREATE OR REPLACE FUNCTION public.icplc_backfill_participants_from_import(p_batch_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  -- Event-scoped authorization. A batch belongs to one event: authorize for that event. With no batch the call
  -- touches every event's rows, so only event-independent (platform) authority may do that.
  IF p_batch_id IS NULL THEN
    IF NOT (public.current_user_role() IN ('super_admin', 'regional_secretary') OR public.icplc_is_programs_member()) THEN
      RAISE EXCEPTION 'Insufficient authorization: backfill across all events requires a platform role'
        USING ERRCODE = '42501';
    END IF;
  ELSIF public.icplc_can_write_participants((SELECT b.event_id FROM public.icplc_import_batches b WHERE b.id = p_batch_id)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required for this event'
      USING ERRCODE = '42501';
  END IF;
  RETURN public._icplc_backfill_from_import(p_batch_id);
END;
$function$;
