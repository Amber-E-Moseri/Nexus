-- ============================================================
-- Fix notify_sync_failure — the previous version (20260930000005) does
-- `SELECT organization_id INTO v_org_id FROM public.departments WHERE id =
-- p_space_id`, but departments.organization_id does not exist anywhere in
-- this database (confirmed live). That raises an unhandled Postgres error
-- inside the function body, which rolls back the entire invocation
-- (including the activity_log insert that precedes it). The edge function
-- never checks this RPC's error, so every call has been silently failing.
--
-- Rewritten to be org-free (single-tenant: notify every calendar manager
-- directly via calendar_permissions, no org resolution) and repointed at
-- source_id instead of space_id, matching the new Ministry Calendar
-- multi-source model. Confirmed via grep this RPC has exactly one live
-- caller (supabase/functions/google-calendar-sync/index.ts), which is being
-- rewritten in the same phase — safe to change the signature.
--
-- Live column shapes verified before writing this (do not assume otherwise):
--   activity_log(id, user_id, action, entity_type, entity_id, "timestamp")
--   notifications(id, user_id, type, payload, read, created_at, updated_at)
-- ============================================================

-- CREATE OR REPLACE cannot rename an existing parameter (p_space_id ->
-- p_source_id) even though the type signature is unchanged — must drop first.
DROP FUNCTION IF EXISTS public.notify_sync_failure(UUID, TEXT);

CREATE FUNCTION public.notify_sync_failure(
  p_source_id     UUID DEFAULT NULL,
  p_error_message TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
  VALUES (NULL, 'calendar_sync_failed', 'calendar_sync', p_source_id);

  INSERT INTO public.notifications (user_id, type, payload)
  SELECT cp.user_id, 'calendar_sync_failure',
    jsonb_build_object('source_id', p_source_id, 'error_message', p_error_message, 'occurred_at', NOW())
  FROM public.calendar_permissions cp
  WHERE cp.can_manage = TRUE;
END;
$$;
