-- Enable mobile push by default for task_due_soon and daily_digest.
-- Prior migration seeded task_due_soon with in_app+email only; mobile was omitted.
-- daily_digest had no row at all for most users.

-- 1. Turn on mobile for existing task_due_soon rows.
UPDATE public.user_notification_prefs
SET mobile = true
WHERE notification_type = 'task_due_soon'
  AND mobile IS DISTINCT FROM true;

-- 2. Seed daily_digest for all existing users (in_app + email + mobile).
INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email, mobile)
SELECT id, 'daily_digest', true, true, true
FROM public.users
ON CONFLICT (user_id, notification_type) DO UPDATE
  SET mobile = true,
      in_app = true,
      email  = true;

-- 3. Update the new-user seed trigger to include mobile + daily_digest.
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email, mobile)
  VALUES
    (NEW.id, 'task_due_soon', true, true, true),
    (NEW.id, 'daily_digest',  true, true, true)
  ON CONFLICT (user_id, notification_type) DO NOTHING;
  RETURN NEW;
END;
$$;
