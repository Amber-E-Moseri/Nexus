-- Delete and merge ICPLC participants.
--
-- 1. Deleting a participant is restricted to super_admin / regional_secretary (RLS, so it holds even
--    for direct table access). Insert/update keep the existing write gate.
-- 2. icplc_delete_participant(id): the same rule, with a readable error.
-- 3. icplc_merge_participants(keep, remove, choices): folds `remove` into `keep` in ONE transaction.
--      * empty fields on `keep` are filled from `remove`
--      * where both differ, p_choices->>field = 'remove' takes the duplicate's value, else `keep` wins
--      * emails: the chosen one becomes primary, the other is kept as the alternate email
--      * tags, registration/CMP links (identity maps) and import-row links move to `keep`
--      * `remove` is then deleted (its email claims go with it, then `keep` re-claims both emails)
--      * source_values.merged_from records what was merged, and when/by whom

-- ── 1. Delete restricted by role ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS icplc_participants_write ON public.icplc_participants;
DROP POLICY IF EXISTS icplc_participants_insert ON public.icplc_participants;
DROP POLICY IF EXISTS icplc_participants_update ON public.icplc_participants;
DROP POLICY IF EXISTS icplc_participants_delete ON public.icplc_participants;

CREATE POLICY icplc_participants_insert ON public.icplc_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.icplc_can_write_participants());

CREATE POLICY icplc_participants_update ON public.icplc_participants
  FOR UPDATE TO authenticated
  USING (public.icplc_can_write_participants())
  WITH CHECK (public.icplc_can_write_participants());

CREATE POLICY icplc_participants_delete ON public.icplc_participants
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'regional_secretary'));

-- ── 2. Delete ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.icplc_delete_participant(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(public.current_user_role(), '') NOT IN ('super_admin', 'regional_secretary') THEN
    RAISE EXCEPTION 'Only a super admin or regional secretary can delete participants'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.icplc_participants WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_delete_participant(UUID) TO authenticated;

-- ── 3. Merge ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.icplc_merge_participants(
  p_keep UUID,
  p_remove UUID,
  p_choices JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k public.icplc_participants;
  r public.icplc_participants;
  kj JSONB;
  rj JSONB;
  merged JSONB;
  m public.icplc_participants;
  f TEXT;
  kv TEXT;
  rv TEXT;
  kp TEXT; rp TEXT; ka TEXT; ra TEXT;
  prim TEXT; alt TEXT; displaced TEXT;
  v_filled TEXT[] := '{}';
  v_taken TEXT[] := '{}';
  v_kept TEXT[] := '{}';
  v_sv JSONB;
  -- Enum-style columns whose default means "nothing recorded yet".
  v_defaults CONSTANT JSONB := '{"participation_status":"tracking","registration_status":"unknown","passport_readiness":"unknown","visa_requirement":"review","visa_process_status":"not_started"}';
  v_fields CONSTANT TEXT[] := ARRAY[
    'full_name', 'region', 'subgroup', 'leadership', 'notes', 'kingschat_username', 'kingschat_user_id',
    'passport_country', 'passport_region', 'gender', 'canada_residency_status',
    'canada_status_document_readiness', 'passport_readiness', 'visa_requirement', 'visa_process_status',
    'participation_status', 'registration_status', 'arrival_date', 'arrival_time', 'arrival_flight',
    'departure_date', 'departure_time', 'departure_flight'
  ];
BEGIN
  IF COALESCE(public.current_user_role(), '') NOT IN ('super_admin', 'regional_secretary') THEN
    RAISE EXCEPTION 'Only a super admin or regional secretary can merge participants'
      USING ERRCODE = '42501';
  END IF;
  IF p_keep = p_remove THEN
    RAISE EXCEPTION 'Choose two different participants to merge' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO k FROM public.icplc_participants WHERE id = p_keep FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant % not found', p_keep USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO r FROM public.icplc_participants WHERE id = p_remove FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant % not found', p_remove USING ERRCODE = 'P0002'; END IF;
  IF k.event_id <> r.event_id THEN
    RAISE EXCEPTION 'Participants belong to different events' USING ERRCODE = '22023';
  END IF;

  kj := to_jsonb(k);
  rj := to_jsonb(r);
  merged := kj;

  -- Scalar fields: fill blanks, resolve conflicts by the caller's choice (default: keep).
  FOREACH f IN ARRAY v_fields LOOP
    kv := NULLIF(BTRIM(kj ->> f), '');
    rv := NULLIF(BTRIM(rj ->> f), '');
    IF v_defaults ? f THEN
      IF kv = v_defaults ->> f THEN kv := NULL; END IF;
      IF rv = v_defaults ->> f THEN rv := NULL; END IF;
    END IF;
    IF rv IS NULL THEN CONTINUE; END IF;
    IF kv IS NULL THEN
      merged := merged || jsonb_build_object(f, rj -> f);
      v_filled := v_filled || f;
    ELSIF kv IS DISTINCT FROM rv THEN
      IF p_choices ->> f = 'remove' THEN
        merged := merged || jsonb_build_object(f, rj -> f);
        v_taken := v_taken || f;
      ELSE
        v_kept := v_kept || f;
      END IF;
    END IF;
  END LOOP;

  -- Emails: one primary (per choice), the other survives as the alternate.
  kp := NULLIF(BTRIM(k.email), '');
  rp := NULLIF(BTRIM(r.email), '');
  ka := NULLIF(BTRIM(k.alternate_email), '');
  ra := NULLIF(BTRIM(r.alternate_email), '');
  IF kp IS NULL THEN
    prim := rp; displaced := NULL;
  ELSIF rp IS NULL OR LOWER(kp) = LOWER(rp) THEN
    prim := kp; displaced := NULL;
  ELSIF p_choices ->> 'email' = 'remove' THEN
    prim := rp; displaced := kp; v_taken := v_taken || 'email'::text;
  ELSE
    prim := kp; displaced := rp; v_kept := v_kept || 'email'::text;
  END IF;
  IF kp IS NULL AND rp IS NOT NULL THEN v_filled := v_filled || 'email'::text; END IF;
  alt := NULL;
  FOREACH f IN ARRAY ARRAY[ka, displaced, ra] LOOP
    IF f IS NOT NULL AND (prim IS NULL OR LOWER(f) <> LOWER(prim)) THEN alt := f; EXIT; END IF;
  END LOOP;

  -- Move everything that points at the duplicate onto the survivor.
  UPDATE public.icplc_identity_maps SET participant_id = p_keep WHERE participant_id = p_remove;
  INSERT INTO public.icplc_participant_tags (participant_id, tag_id, added_by, added_at)
    SELECT p_keep, tag_id, added_by, added_at FROM public.icplc_participant_tags WHERE participant_id = p_remove
    ON CONFLICT DO NOTHING;
  UPDATE public.icplc_import_rows SET participant_id = p_keep WHERE participant_id = p_remove;
  UPDATE public.icplc_import_rows SET resolved_participant_id = p_keep WHERE resolved_participant_id = p_remove;

  -- Remove the duplicate first: this frees its email claims and any unique nexus_user_id.
  DELETE FROM public.icplc_participants WHERE id = p_remove;

  m := jsonb_populate_record(NULL::public.icplc_participants, merged);
  v_sv := COALESCE(r.source_values, '{}'::JSONB) || COALESCE(k.source_values, '{}'::JSONB);
  v_sv := v_sv || jsonb_build_object(
    'merged_from',
    COALESCE(k.source_values -> 'merged_from', '[]'::JSONB) || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'full_name', r.full_name, 'email', r.email,
      'merged_at', now(), 'merged_by', auth.uid(),
      'filled_from_duplicate', to_jsonb(v_filled), 'chose_duplicate_value', to_jsonb(v_taken)
    ))
  );

  UPDATE public.icplc_participants SET
    full_name = m.full_name, region = m.region, subgroup = m.subgroup, leadership = m.leadership,
    notes = m.notes, kingschat_username = m.kingschat_username, kingschat_user_id = m.kingschat_user_id,
    passport_country = m.passport_country, passport_region = m.passport_region, gender = m.gender,
    canada_residency_status = m.canada_residency_status,
    canada_status_document_readiness = m.canada_status_document_readiness,
    passport_readiness = m.passport_readiness, visa_requirement = m.visa_requirement,
    visa_process_status = m.visa_process_status, participation_status = m.participation_status,
    registration_status = m.registration_status,
    arrival_date = m.arrival_date, arrival_time = m.arrival_time, arrival_flight = m.arrival_flight,
    departure_date = m.departure_date, departure_time = m.departure_time, departure_flight = m.departure_flight,
    email = prim,
    alternate_email = alt,
    nexus_user_id = COALESCE(k.nexus_user_id, r.nexus_user_id),
    override_fields = COALESCE(r.override_fields, '{}'::JSONB) || COALESCE(k.override_fields, '{}'::JSONB),
    source_values = v_sv,
    updated_at = now()
  WHERE id = p_keep;

  RETURN jsonb_build_object(
    'kept', p_keep,
    'removed', p_remove,
    'filled_from_duplicate', to_jsonb(v_filled),
    'chose_duplicate_value', to_jsonb(v_taken),
    'kept_own_value', to_jsonb(v_kept)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.icplc_merge_participants(UUID, UUID, JSONB) TO authenticated;
