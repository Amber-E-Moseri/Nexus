-- Backfill in_app=true (and mobile=true for push-enabled users) for all core
-- notification types for ALL users. Prior migrations only seeded task_due_soon
-- for some users; due-date-reminders filters on in_app=true so anyone missing
-- the row gets silently skipped even for browser notifications.

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
    -- All users: ensure in_app=true row exists
    INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email, mobile)
    SELECT u.id, v_type, true, false,
           COALESCE(u.push_enabled, false)  -- mobile=true only if push already on
    FROM public.users u
    ON CONFLICT (user_id, notification_type) DO UPDATE
      SET in_app = true,
          mobile = CASE
                     WHEN EXCLUDED.mobile THEN true
                     ELSE public.user_notification_prefs.mobile
                   END;
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
