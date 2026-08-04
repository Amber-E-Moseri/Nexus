-- Weekly recap (Monday 13:00 UTC) + re-engagement (daily 14:00 UTC) email system.
-- Both are opt-out by default — edge functions treat "no row" as opted in.
-- Seeding rows here so users can toggle these in Settings immediately.

-- 1. Seed prefs for existing active users
INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email)
SELECT id, 'weekly_recap', false, true
FROM public.users
WHERE status = 'active'
ON CONFLICT (user_id, notification_type) DO NOTHING;

INSERT INTO public.user_notification_prefs (user_id, notification_type, in_app, email)
SELECT id, 'reengagement_reminder', false, true
FROM public.users
WHERE status = 'active'
ON CONFLICT (user_id, notification_type) DO NOTHING;

-- 2. Retire the old email-digest cron job if it exists
DO $$ BEGIN
  PERFORM cron.unschedule('email-digest');
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3. Schedule weekly-recap-email — every Monday at 13:00 UTC (9 am Eastern)
DO $$ BEGIN
  PERFORM cron.unschedule('weekly-recap-email');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'weekly-recap-email',
  '0 13 * * 1',
  $$
  SELECT net.http_post(
    url       := (SELECT current_setting('app.supabase_url')) || '/functions/v1/weekly-recap-email',
    headers   := jsonb_build_object(
                   'Authorization', 'Bearer ' || (SELECT current_setting('app.service_role_key')),
                   'Content-Type',  'application/json'
                 ),
    body      := '{}'::jsonb
  );
  $$
);

-- 4. Schedule reengagement-email — every day at 14:00 UTC (10 am Eastern)
--    Runs after weekly-recap (13:00) so the recap's email_delivery_log row is
--    visible when the spam guard queries it.
DO $$ BEGIN
  PERFORM cron.unschedule('reengagement-email');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'reengagement-email',
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
