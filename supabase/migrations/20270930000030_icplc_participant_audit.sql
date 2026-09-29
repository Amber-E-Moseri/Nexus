-- Audit trail for ICPLC participants: every change to a tracked field is written to activity_log with
-- who made it (auth.uid(), or NULL for system/service-role work), the field, the old value and the new value.
-- Done in the database so it covers every path: drawer edits, Board drags, auto-confirm, imports, CMP sync.

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
    'arrival_date', 'arrival_time', 'arrival_flight', 'departure_date', 'departure_time', 'departure_flight'
  ];
  v_old jsonb;
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_actor uuid := auth.uid();
  v_source text;
  v_reason text := NULLIF(current_setting('icplc.change_reason', true), '');
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
    jsonb_strip_nulls(jsonb_build_object('actor_id', v_actor, 'source', v_source, 'reason', v_reason)) || jsonb_build_object('changes', v_changes)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS icplc_participants_audit ON public.icplc_participants;
CREATE TRIGGER icplc_participants_audit
  AFTER INSERT OR UPDATE ON public.icplc_participants
  FOR EACH ROW EXECUTE FUNCTION public.icplc_audit_participant_change();

-- Auto-confirm (Ready => Confirmed) goes through here so the audit trail says WHY it happened.
-- SECURITY INVOKER: the caller's own write permission (RLS) still decides who may do this.
CREATE OR REPLACE FUNCTION public.icplc_apply_auto_confirm(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('icplc.change_reason', 'Automatic: readiness reached Ready, so participation was set to Confirmed', true);
  PERFORM set_config('icplc.change_source', 'automatic', true);
  UPDATE public.icplc_participants
     SET participation_status = 'confirmed'
   WHERE id = ANY (p_ids)
     AND participation_status IN ('tracking', 'likely');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_apply_auto_confirm(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.icplc_apply_auto_confirm(uuid[]) TO authenticated;
