-- Backfill mobile=true for core notification types for users who already have
-- push_enabled=true. Prior migrations only seeded task_due_soon; this covers
-- the rest of the types that requestPushPermission now seeds on first subscribe.

DO $$
DECLARE
  v_types text[] := ARRAY[
    'task_assigned', 'task_comment', 'task_due_soon', 'task_status_changed',
    'mention', 'sprint_added', 'meeting_scheduled', 'meeting_reminder',
    'subtask_completed', 'dependency_cleared', 'task_completed'
  ];
  v_type text;
BEGIN
  FOREACH v_type IN ARRAY v_types LOOP
    INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email, mobile)
    SELECT u.id, v_type, true, false, true
    FROM public.users u
    WHERE u.push_enabled = true
    ON CONFLICT (user_id, notification_type) DO UPDATE
      SET mobile = true;
  END LOOP;
END;
$$;

-- Also update the new-user seed trigger to include all core types with mobile.
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email, mobile)
  VALUES
    (NEW.id, 'task_assigned',      true,  false, true),
    (NEW.id, 'task_comment',       true,  false, true),
    (NEW.id, 'task_due_soon',      true,  true,  true),
    (NEW.id, 'task_status_changed',true,  false, true),
    (NEW.id, 'mention',            true,  false, true),
    (NEW.id, 'sprint_added',       true,  false, true),
    (NEW.id, 'meeting_scheduled',  true,  false, true),
    (NEW.id, 'meeting_reminder',   true,  false, true),
    (NEW.id, 'subtask_completed',  true,  false, true),
    (NEW.id, 'dependency_cleared', true,  false, true),
    (NEW.id, 'task_completed',     true,  false, true),
    (NEW.id, 'daily_digest',       true,  true,  true)
  ON CONFLICT (user_id, notification_type) DO NOTHING;
  RETURN NEW;
END;
$$;
