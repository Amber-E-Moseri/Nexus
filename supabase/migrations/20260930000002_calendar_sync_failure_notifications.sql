-- Wire up notify_sync_failure() to insert in-app notifications for all
-- users who have can_manage=true for the affected space's org.
-- Also adds calendar_sync_failure to the notifications type registry.

CREATE OR REPLACE FUNCTION public.notify_sync_failure(
  p_space_id uuid,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Log the failure (retained from original)
  INSERT INTO public.activity_log (user_id, action, entity_type, metadata)
  VALUES (
    NULL,
    'calendar_sync_failed',
    'calendar_sync',
    jsonb_build_object(
      'space_id', p_space_id,
      'error', p_error_message,
      'timestamp', NOW()
    )
  );

  -- Resolve org from the space
  SELECT organization_id INTO v_org_id
  FROM public.departments
  WHERE id = p_space_id
  LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  -- Insert in-app notification for every user with can_manage=true in this org
  INSERT INTO public.notifications (user_id, type, payload)
  SELECT
    cp.user_id,
    'calendar_sync_failure',
    jsonb_build_object(
      'space_id',      p_space_id,
      'error_message', p_error_message,
      'occurred_at',   NOW()
    )
  FROM public.calendar_permissions cp
  WHERE cp.org_id = v_org_id
    AND cp.can_manage = true
  ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.notify_sync_failure(uuid, text) IS
  'Logs a Google Calendar sync failure and inserts in-app notifications for all calendar managers.';
