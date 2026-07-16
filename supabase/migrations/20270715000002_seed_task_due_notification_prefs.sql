-- Seed task_due_soon notification preferences for all existing users.
-- The due-date-reminders edge function gates on this table, but it was
-- never populated, so no due-date notifications ever fired.

INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email)
SELECT id, 'task_due_soon', true, true
FROM public.users
ON CONFLICT (user_id, notification_type) DO NOTHING;

-- Auto-create the pref for every new user going forward.
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email)
  VALUES (NEW.id, 'task_due_soon', true, true)
  ON CONFLICT (user_id, notification_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_notification_prefs ON public.users;
CREATE TRIGGER trg_create_default_notification_prefs
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_prefs();
