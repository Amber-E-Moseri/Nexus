-- Bug 1: Add email_sent_at column — task-notification-email-batch has queried
-- this column since it was written but it was never created, so every cron run
-- failed with a 500 and zero batch emails were ever sent.
--
-- Bug 5 prevention: update the per-row email dispatch trigger to pass
-- notification_id so send-notification-email can stamp email_sent_at after
-- sending. The batch then sees email_sent_at IS NOT NULL and skips already-sent
-- rows, preventing duplicate emails for types handled by both systems.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Partial index speeds up the batch's IS NULL filter
CREATE INDEX IF NOT EXISTS notifications_email_pending_idx
  ON public.notifications (type, created_at)
  WHERE email_sent_at IS NULL;

-- Update the trigger to include notification_id in the edge function body
CREATE OR REPLACE FUNCTION public.dispatch_email_on_notification_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
BEGIN
  IF v_url IS NULL OR v_key IS NULL THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url     := v_url || '/functions/v1/send-notification-email',
    body    := jsonb_build_object(
                 'notification_id',   NEW.id,
                 'user_id',           NEW.user_id,
                 'notification_type', NEW.type,
                 'payload',           COALESCE(NEW.payload, '{}'::jsonb)
               ),
    headers := jsonb_build_object(
                 'apikey',        v_key,
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'
               )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$func$;
