-- ICPLC bulk operations, phase 1/2.
--
--   1. icplc_bulk_mark_documentation_reviewed(p_items jsonb)
--        Mass "Mark reviewed". It records exactly what the single-participant review records
--        (documentation_review_by / _at / _fingerprint) and nothing else. The fingerprint is computed by the
--        client with the SAME documentationReviewFingerprint() the drawer uses (the rules live in JS and are
--        not duplicated here); the database only stores it and guards against stale state.
--        Per-participant results, not all-or-nothing.
--   2. icplc_bulk_set_tag(p_ids uuid[], p_tag_id uuid, p_action text)
--        Idempotent add / remove of ONE tag across participants. Never replaces a participant's tag set.
--   3. Tag audit: icplc_participant_tags changes are written to activity_log (they were not audited).
--   4. icplc_audit_participant_change gains an optional bulk batch id (icplc.bulk_batch_id) in metadata.
--      Same function as 20271001000001 otherwise.
--
-- Authorization (hardened ICPLC pattern, see 20271001000002): the functions are SECURITY INVOKER, so RLS still
-- decides every row, AND they check icplc_can_write_participants() IS NOT TRUE (null-safe, fail closed) plus
-- auth.uid() IS NULL. anon / PUBLIC EXECUTE is revoked. No service_role bypass: bulk actions are staff actions.
--
-- No notification is created by anything here.
-- Apply after 20271001000004.

-- ============================================================================
-- 1. Audit trigger: add icplc.bulk_batch_id (otherwise identical to 20271001000001)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.icplc_audit_participant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  -- Operational fields only. source_values / override_fields / updated_at are bookkeeping, not decisions.
  v_tracked text[] := ARRAY[
    'full_name', 'email', 'alternate_email', 'region', 'subgroup', 'group_name', 'leadership', 'notes',
    'gender', 'kingschat_username', 'kingschat_user_id',
    'participation_status', 'registration_status',
    'canada_residency_status', 'canada_status_document_readiness',
    'passport_country', 'passport_readiness', 'passport_region',
    'visa_requirement', 'visa_process_status',
    'documentation_assistance_requested',
    'flight_not_required_reason', 'flight_not_required_note',
    'documentation_review_at', 'documentation_review_fingerprint',
    'arrival_date', 'arrival_time', 'arrival_flight', 'departure_date', 'departure_time', 'departure_flight'
  ];
  v_old jsonb;
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_actor uuid := auth.uid();
  v_source text;
  v_reason text := NULLIF(current_setting('icplc.change_reason', true), '');
  v_batch text := NULLIF(current_setting('icplc.bulk_batch_id', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_source := CASE WHEN v_actor IS NULL THEN 'system' ELSE 'app' END;
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN v_actor END,
      'participant_created', 'icplc_participant', NEW.id,
      jsonb_strip_nulls(jsonb_build_object('actor_id', v_actor, 'source', v_source, 'reason', v_reason, 'full_name', NEW.full_name))
    );
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  FOREACH v_field IN ARRAY v_tracked LOOP
    -- A column that does not exist yet on an older schema is simply absent from both rows.
    IF v_old ? v_field AND (v_old -> v_field) IS DISTINCT FROM (v_new -> v_field) THEN
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', v_old -> v_field, 'to', v_new -> v_field));
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_source := COALESCE(NULLIF(current_setting('icplc.change_source', true), ''), CASE WHEN v_actor IS NULL THEN 'system' ELSE 'app' END);

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN v_actor END,
    'participant_updated', 'icplc_participant', NEW.id,
    -- strip only the top-level empties: a change FROM null must keep its explicit "from": null
    jsonb_strip_nulls(jsonb_build_object('actor_id', v_actor, 'source', v_source, 'reason', v_reason, 'batch_id', v_batch))
      || jsonb_build_object('changes', v_changes)
  );
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Tag audit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.icplc_audit_participant_tag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_participant uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.participant_id ELSE NEW.participant_id END;
  v_tag uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.tag_id ELSE NEW.tag_id END;
  v_tag_name text;
  v_source text := COALESCE(NULLIF(current_setting('icplc.change_source', true), ''), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'app' END);
  v_reason text := NULLIF(current_setting('icplc.change_reason', true), '');
  v_batch text := NULLIF(current_setting('icplc.bulk_batch_id', true), '');
BEGIN
  -- A participant being deleted or merged away cascades its tags; that is not a tag decision.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.icplc_participants WHERE id = v_participant) THEN
    RETURN OLD;
  END IF;

  SELECT name INTO v_tag_name FROM public.icplc_tags WHERE id = v_tag;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN v_actor END,
    CASE WHEN TG_OP = 'DELETE' THEN 'participant_tag_removed' ELSE 'participant_tag_added' END,
    'icplc_participant', v_participant,
    jsonb_strip_nulls(jsonb_build_object(
      'actor_id', v_actor, 'source', v_source, 'reason', v_reason, 'batch_id', v_batch,
      'tag_id', v_tag, 'tag_name', v_tag_name
    ))
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS icplc_participant_tags_audit ON public.icplc_participant_tags;
CREATE TRIGGER icplc_participant_tags_audit
  AFTER INSERT OR DELETE ON public.icplc_participant_tags
  FOR EACH ROW EXECUTE FUNCTION public.icplc_audit_participant_tag_change();

-- ============================================================================
-- 3. Bulk: mark documentation reviewed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.icplc_bulk_mark_documentation_reviewed(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_fingerprint text;
  v_expected timestamptz;
  v_row public.icplc_participants%ROWTYPE;
  v_count integer;
  v_status text;
  v_reason text;
BEGIN
  -- Fail closed. icplc_can_write_participants() is NULL (not false) for an unauthenticated caller, so a plain
  -- `IF NOT ...` would silently let them through; IS NOT TRUE does not.
  IF v_actor IS NULL OR public.icplc_can_write_participants() IS NOT TRUE THEN
    RAISE EXCEPTION 'permission denied for icplc_bulk_mark_documentation_reviewed' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 1000 THEN
    RAISE EXCEPTION 'too many participants in one bulk request (max 1000)' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('icplc.change_source', 'bulk_action', true);
  PERFORM set_config('icplc.change_reason', 'Bulk documentation review (' || jsonb_array_length(p_items) || ' selected)', true);
  PERFORM set_config('icplc.bulk_batch_id', v_batch::text, true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_status := NULL; v_reason := NULL; v_id := NULL;
    BEGIN
      v_id := NULLIF(v_item ->> 'id', '')::uuid;
      v_fingerprint := COALESCE(v_item ->> 'fingerprint', '');
      v_expected := NULLIF(v_item ->> 'expected_updated_at', '')::timestamptz;

      IF v_id IS NULL THEN
        v_status := 'failed'; v_reason := 'invalid_id';
      ELSIF v_id = ANY (v_seen) THEN
        v_status := 'skipped_ineligible'; v_reason := 'duplicate_id';
      ELSE
        v_seen := v_seen || v_id;
        -- Lock the row so the stale check and the write are one step. RLS applies: an unreadable row is not found.
        SELECT * INTO v_row FROM public.icplc_participants WHERE id = v_id FOR UPDATE;
        IF NOT FOUND THEN
          v_status := 'failed'; v_reason := 'not_found';
        ELSIF v_row.participation_status = 'not_attending' THEN
          v_status := 'skipped_ineligible'; v_reason := 'not_attending';
        ELSIF v_row.participation_status NOT IN ('confirmed', 'likely') THEN
          -- Mirrors documentationMissingInfo(): only committed participants have missing information to review.
          v_status := 'skipped_ineligible'; v_reason := 'not_committed';
        ELSIF v_fingerprint = '' THEN
          v_status := 'skipped_ineligible'; v_reason := 'nothing_missing';
        ELSIF v_expected IS NULL OR v_row.updated_at IS DISTINCT FROM v_expected THEN
          v_status := 'skipped_stale'; v_reason := 'changed_since_loaded';
        ELSIF v_row.documentation_review_at IS NOT NULL
              AND v_row.documentation_review_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
          v_status := 'already_reviewed'; v_reason := 'same_state_already_reviewed';
        ELSE
          -- ONLY the three review columns. Never a whole-row write.
          UPDATE public.icplc_participants
             SET documentation_review_by = v_actor,
                 documentation_review_at = now(),
                 documentation_review_fingerprint = v_fingerprint
           WHERE id = v_id AND updated_at = v_expected;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          IF v_count = 1 THEN
            v_status := 'updated';
          ELSE
            v_status := 'failed'; v_reason := 'update_blocked';
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One bad row must not undo the others. Do not leak SQLERRM to the client.
      v_status := 'failed'; v_reason := 'error';
    END;
    v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'status', v_status, 'reason', v_reason));
  END LOOP;

  PERFORM set_config('icplc.change_source', '', true);
  PERFORM set_config('icplc.change_reason', '', true);
  PERFORM set_config('icplc.bulk_batch_id', '', true);

  RETURN jsonb_build_object('batch_id', v_batch, 'results', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_bulk_mark_documentation_reviewed(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.icplc_bulk_mark_documentation_reviewed(jsonb) TO authenticated;

-- ============================================================================
-- 4. Bulk: add / remove one tag
-- ============================================================================
CREATE OR REPLACE FUNCTION public.icplc_bulk_set_tag(p_ids uuid[], p_tag_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_results jsonb := '[]'::jsonb;
  v_count integer;
  v_status text;
  v_reason text;
BEGIN
  IF v_actor IS NULL OR public.icplc_can_write_participants() IS NOT TRUE THEN
    RAISE EXCEPTION 'permission denied for icplc_bulk_set_tag' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'p_action must be add or remove' USING ERRCODE = '22023';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) > 1000 THEN
    RAISE EXCEPTION 'invalid or too many participants (max 1000)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.icplc_tags WHERE id = p_tag_id) THEN
    RAISE EXCEPTION 'tag not found' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('icplc.change_source', 'bulk_action', true);
  PERFORM set_config('icplc.change_reason', 'Bulk tag ' || p_action || ' (' || cardinality(p_ids) || ' selected)', true);
  PERFORM set_config('icplc.bulk_batch_id', v_batch::text, true);

  FOREACH v_id IN ARRAY p_ids LOOP
    v_status := NULL; v_reason := NULL;
    BEGIN
      IF v_id IS NULL THEN
        v_status := 'failed'; v_reason := 'invalid_id';
      ELSIF v_id = ANY (v_seen) THEN
        v_status := 'skipped_ineligible'; v_reason := 'duplicate_id';
      ELSIF NOT EXISTS (SELECT 1 FROM public.icplc_participants WHERE id = v_id) THEN
        v_seen := v_seen || v_id;
        v_status := 'failed'; v_reason := 'not_found';
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.icplc_participants pp
          JOIN public.icplc_tags t ON t.id = p_tag_id
         WHERE pp.id = v_id AND (t.event_id IS NULL OR t.event_id = pp.event_id)
      ) THEN
        -- A tag defined for another event must not be attached across events.
        v_seen := v_seen || v_id;
        v_status := 'skipped_ineligible'; v_reason := 'tag_not_for_event';
      ELSE
        v_seen := v_seen || v_id;
        IF p_action = 'add' THEN
          INSERT INTO public.icplc_participant_tags (participant_id, tag_id, added_by)
          VALUES (v_id, p_tag_id, v_actor)
          ON CONFLICT (participant_id, tag_id) DO NOTHING;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          IF v_count = 1 THEN v_status := 'updated'; ELSE v_status := 'no_change'; v_reason := 'already_tagged'; END IF;
        ELSE
          DELETE FROM public.icplc_participant_tags WHERE participant_id = v_id AND tag_id = p_tag_id;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          IF v_count = 1 THEN v_status := 'updated'; ELSE v_status := 'no_change'; v_reason := 'not_tagged'; END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_status := 'failed'; v_reason := 'error';
    END;
    v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'status', v_status, 'reason', v_reason));
  END LOOP;

  PERFORM set_config('icplc.change_source', '', true);
  PERFORM set_config('icplc.change_reason', '', true);
  PERFORM set_config('icplc.bulk_batch_id', '', true);

  RETURN jsonb_build_object('batch_id', v_batch, 'results', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_bulk_set_tag(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.icplc_bulk_set_tag(uuid[], uuid, text) TO authenticated;
