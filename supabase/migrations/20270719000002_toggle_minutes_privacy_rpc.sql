CREATE OR REPLACE FUNCTION public.toggle_minutes_privacy(p_minutes_id uuid, p_is_private boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_role text;
BEGIN
  SELECT created_by INTO v_created_by FROM meeting_minutes WHERE id = p_minutes_id;
  SELECT role INTO v_role FROM users WHERE id = auth.uid();

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'minutes not found';
  END IF;

  -- regional_secretary has read-bypass (Fix 1) but NOT write-bypass here.
  -- Only super_admin can toggle another user's privacy setting.
  IF auth.uid() <> v_created_by AND v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE meeting_minutes SET is_private = p_is_private WHERE id = p_minutes_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_minutes_privacy(uuid, boolean) TO authenticated;
