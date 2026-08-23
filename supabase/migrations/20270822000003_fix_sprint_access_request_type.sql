-- Bug 3: type name mismatch — the trigger was inserting 'sprint_access_request'
-- but every downstream handler (push label map, email batch TASK_EMAIL_TYPES,
-- formatNotificationMessage, inbox label) expects 'sprint_access_requested'.
-- Sprint access notifications showed as raw type string in inbox and were
-- silently skipped by email and push.

UPDATE public.notifications
SET type = 'sprint_access_requested'
WHERE type = 'sprint_access_request';

-- Fix the trigger function so new requests use the correct type name
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

  IF v_sprint.created_by IS NOT NULL THEN
    v_notifiable_users := v_notifiable_users || v_sprint.created_by;
  END IF;

  IF v_sprint.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors') THEN
    v_notifiable_users := v_notifiable_users || (
      SELECT ARRAY_AGG(id) FROM public.users WHERE role = 'regional_secretary'
    );
    v_notifiable_users := v_notifiable_users || (
      SELECT ARRAY_AGG(user_id) FROM public.space_members
      WHERE space_id = (SELECT id FROM public.departments WHERE name = 'Programs')
    );
  END IF;

  IF v_sprint.space_type = 'group' THEN
    v_notifiable_users := v_notifiable_users || (
      SELECT ARRAY_AGG(user_id) FROM public.space_members
      WHERE space_id = v_sprint.department_id
        AND role IN ('owner', 'manager')
    );
  END IF;

  v_notifiable_users := ARRAY(SELECT DISTINCT unnest(v_notifiable_users) WHERE unnest IS NOT NULL);

  INSERT INTO public.notifications (user_id, type, payload)
  SELECT
    approver_id,
    'sprint_access_requested',   -- was 'sprint_access_request' (typo fixed)
    jsonb_build_object(
      'requester_name',  v_requester.name,
      'requester_email', v_requester.email,
      'sprint_name',     v_sprint.name,
      'sprint_id',       v_sprint.id,
      'request_id',      NEW.id,
      'action',          'review_access_request'
    )
  FROM unnest(v_notifiable_users) AS approver_id;

  RETURN NEW;
END;
$$;
