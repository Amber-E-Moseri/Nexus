-- Notify regional sec, programs members, group owners, and sprint creators on access requests

CREATE OR REPLACE FUNCTION public.notify_sprint_access_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sprint RECORD;
  v_requester RECORD;
  v_notifiable_users uuid[];
BEGIN
  SELECT id, created_by, department_id, space_type, name INTO v_sprint
  FROM public.sprints
  WHERE id = NEW.sprint_id;

  SELECT id, name, email INTO v_requester
  FROM public.users
  WHERE id = NEW.user_id;

  IF v_sprint.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_notifiable_users := ARRAY[]::uuid[];

  -- Sprint creator can always approve
  IF v_sprint.created_by IS NOT NULL THEN
    v_notifiable_users := v_notifiable_users || v_sprint.created_by;
  END IF;

  -- For Pastors (regional) sprints: regional secretaries and programs members
  IF v_sprint.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors') THEN
    -- Add all regional secretaries
    v_notifiable_users := v_notifiable_users || (
      SELECT ARRAY_AGG(id) FROM public.users WHERE role = 'regional_secretary'
    );
    -- Add all programs space members
    v_notifiable_users := v_notifiable_users || (
      SELECT ARRAY_AGG(user_id) FROM public.space_members
      WHERE space_id = (SELECT id FROM public.departments WHERE name = 'Programs')
    );
  END IF;

  -- For group sprints: group owners and managers
  IF v_sprint.space_type = 'group' THEN
    v_notifiable_users := v_notifiable_users || (
      SELECT ARRAY_AGG(user_id) FROM public.space_members
      WHERE space_id = v_sprint.department_id
        AND role IN ('owner', 'manager')
    );
  END IF;

  -- Remove NULLs and duplicates
  v_notifiable_users := ARRAY(SELECT DISTINCT unnest(v_notifiable_users) WHERE unnest IS NOT NULL);

  -- Create notifications for each approver
  INSERT INTO public.notifications (user_id, type, payload)
  SELECT
    approver_id,
    'sprint_access_request',
    jsonb_build_object(
      'requester_name', v_requester.name,
      'requester_email', v_requester.email,
      'sprint_name', v_sprint.name,
      'sprint_id', v_sprint.id,
      'request_id', NEW.id,
      'action', 'review_access_request'
    )
  FROM unnest(v_notifiable_users) AS approver_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sprint_access_request_notify_trigger ON public.sprint_access_requests;

CREATE TRIGGER sprint_access_request_notify_trigger
  AFTER INSERT ON public.sprint_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sprint_access_request();
