-- Rename notification pref types to match updated email system:
--   weekly_recap        → weekly_digest
--   reengagement_reminder → dormant_nudge
-- Also adds opened_at / clicked_at to email_delivery_log for future
-- open/click pixel tracking (columns nullable; populated by a tracking
-- edge function, not by the send functions themselves).

-- 1. Rename existing pref rows ─────────────────────────────────────────────────
UPDATE public.user_notification_prefs
SET notification_type = 'weekly_digest'
WHERE notification_type = 'weekly_recap';

UPDATE public.user_notification_prefs
SET notification_type = 'dormant_nudge'
WHERE notification_type = 'reengagement_reminder';

-- 2. Seed rows for any active users that don't have them yet ──────────────────
INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email)
SELECT id, 'weekly_digest', false, true
FROM public.users
WHERE status = 'active'
ON CONFLICT (user_id, notification_type) DO NOTHING;

INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email)
SELECT id, 'dormant_nudge', false, true
FROM public.users
WHERE status = 'active'
ON CONFLICT (user_id, notification_type) DO NOTHING;

-- 3. Open/click tracking columns on email_delivery_log ────────────────────────
ALTER TABLE public.email_delivery_log
  ADD COLUMN IF NOT EXISTS opened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

-- 4. Update dormant_nudge cron schedule: runs daily at 14:00 UTC
--    (threshold is now 14 days, enforced in the function — no cron change needed)
--    Rename the cron job label to reflect the new terminology.
DO $$ BEGIN
  PERFORM cron.unschedule('reengagement-email');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'dormant-nudge-email',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url       := (SELECT current_setting('app.supabase_url')) || '/functions/v1/reengagement-email',
    headers   := jsonb_build_object(
                   'Authorization', 'Bearer ' || (SELECT current_setting('app.service_role_key')),
                   'Content-Type',  'application/json'
                 ),
    body      := '{}'::jsonb
  );
  $$
);
