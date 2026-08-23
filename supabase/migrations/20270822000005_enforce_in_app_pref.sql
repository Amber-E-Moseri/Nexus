-- Bug 8: in_app preference is never enforced at write time.
-- Every creation path inserts unconditionally, so users who disable a type
-- still see it in their inbox. This BEFORE INSERT trigger cancels the insert
-- when user_notification_prefs.in_app = false for that (user_id, type) pair.
-- No row = default true (allowed); row with in_app = false = blocked.

CREATE OR REPLACE FUNCTION public.enforce_in_app_pref()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_in_app boolean;
BEGIN
  SELECT in_app INTO v_in_app
  FROM public.user_notification_prefs
  WHERE user_id = NEW.user_id
    AND notification_type = NEW.type;

  -- NULL (no pref row) = allowed; false = cancel insert
  IF v_in_app IS NOT DISTINCT FROM false THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_in_app_pref_before_insert ON public.notifications;
CREATE TRIGGER enforce_in_app_pref_before_insert
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_in_app_pref();
