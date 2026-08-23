-- Bug 12: notify_task_completed fans out task_completed to all task_follows
-- watchers including the assignee. The assignee is the one who marked it done
-- and already knows — notifying them is noise.
-- This replacement excludes the task's assignee_id from the fan-out.

CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_watcher RECORD;
  v_payload jsonb;
  v_completed_status_id uuid;
BEGIN
  -- Only fire when the task transitions INTO a completed-category status
  IF NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;

  SELECT tsd.id INTO v_completed_status_id
  FROM public.task_status_definitions tsd
  WHERE tsd.category = 'completed'
    AND tsd.is_org_status = true
  LIMIT 1;

  -- Resolve new status to its org-level category
  DECLARE
    v_new_category text;
  BEGIN
    SELECT
      CASE WHEN tsd.is_org_status THEN tsd.category
           ELSE parent.category
      END INTO v_new_category
    FROM public.task_status_definitions tsd
    LEFT JOIN public.task_status_definitions parent
      ON parent.id = tsd.org_status_id
    WHERE tsd.id = NEW.status_id;

    -- Only notify on transition INTO completed
    IF v_new_category != 'completed' THEN
      RETURN NEW;
    END IF;

    -- Check old status was not already completed
    DECLARE
      v_old_category text;
    BEGIN
      SELECT
        CASE WHEN tsd.is_org_status THEN tsd.category
             ELSE parent.category
        END INTO v_old_category
      FROM public.task_status_definitions tsd
      LEFT JOIN public.task_status_definitions parent
        ON parent.id = tsd.org_status_id
      WHERE tsd.id = OLD.status_id;

      IF v_old_category = 'completed' THEN
        RETURN NEW;
      END IF;
    END;
  END;

  v_payload := jsonb_build_object(
    'task_id',    NEW.id,
    'task_title', NEW.title
  );

  FOR v_watcher IN
    SELECT tf.user_id
    FROM public.task_follows tf
    WHERE tf.task_id = NEW.id
      -- Exclude the assignee — they completed it and already know
      AND tf.user_id != COALESCE(NEW.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (user_id, type, payload)
    VALUES (v_watcher.user_id, 'task_completed', v_payload)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_task_completed_trigger ON public.tasks;
CREATE TRIGGER notify_task_completed_trigger
  AFTER UPDATE OF status_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_completed();
