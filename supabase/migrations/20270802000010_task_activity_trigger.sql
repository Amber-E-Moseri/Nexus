-- Wire task activity: AFTER INSERT OR UPDATE trigger on tasks that writes
-- to activity_log for the events shown in TaskModal's Activity tab.
-- Uses SECURITY DEFINER so the insert always succeeds regardless of the
-- calling user's RLS context; auth.uid() is still available (same session).

CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- Fallback: system / cron jobs won't have a JWT, use task creator
  IF v_actor IS NULL THEN
    v_actor := COALESCE(NEW.created_by, OLD.created_by);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Only log non-deleted tasks (shouldn't happen, but guard anyway)
    IF NEW.deleted_at IS NULL THEN
      INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
      VALUES (v_actor, 'task_created', 'task', NEW.id);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip activity for soft-delete and undelete
    IF NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
      IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
        VALUES (v_actor, 'task_status_changed', 'task', NEW.id);
      END IF;

      IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
        INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
        VALUES (v_actor, 'task_assigned', 'task', NEW.id);
      END IF;

      IF NEW.title IS DISTINCT FROM OLD.title THEN
        INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
        VALUES (v_actor, 'task_title_changed', 'task', NEW.id);
      END IF;

      IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
        INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
        VALUES (v_actor, 'task_due_date_changed', 'task', NEW.id);
      END IF;

      IF NEW.priority IS DISTINCT FROM OLD.priority THEN
        INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
        VALUES (v_actor, 'task_priority_changed', 'task', NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS task_activity_logger ON public.tasks;
CREATE TRIGGER task_activity_logger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_activity();
