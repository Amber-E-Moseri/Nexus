-- Bug 7a: No notification fires when a sprint changes status.
-- This trigger fans out a sprint_status notification to every active sprint member
-- when the sprints.status column changes.

CREATE OR REPLACE FUNCTION public.notify_sprint_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_payload jsonb;
BEGIN
  -- Only fire on actual status changes
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'sprint_id',   NEW.id,
    'sprint_name', NEW.name,
    'old_status',  OLD.status,
    'new_status',  NEW.status
  );

  FOR v_member IN
    SELECT sm.user_id
    FROM public.sprint_members sm
    WHERE sm.sprint_id = NEW.id
      AND sm.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, type, payload)
    VALUES (v_member.user_id, 'sprint_status', v_payload)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_sprint_status_change_trigger ON public.sprints;
CREATE TRIGGER notify_sprint_status_change_trigger
  AFTER UPDATE OF status ON public.sprints
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sprint_status_change();
