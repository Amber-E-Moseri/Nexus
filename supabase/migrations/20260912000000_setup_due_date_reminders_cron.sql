-- ============================================================
-- DUE DATE REMINDERS CRON JOB
-- Sets up daily reminder notifications for tasks due tomorrow
-- ============================================================

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Schedule due date reminder notifications ───────────────

-- Fires daily at 12:00 UTC (8:00 AM EST/EDT)
-- Sends reminder notifications to users with tasks due tomorrow
SELECT cron.schedule(
  'due-date-reminders',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.supabase_url')) || '/functions/v1/due-date-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
) ON CONFLICT DO NOTHING;

-- ─── Create function to track cron job executions ──────────

CREATE TABLE IF NOT EXISTS public.cron_job_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'error')),
  notifications_sent INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cron_job_log_job_name_started_idx
  ON public.cron_job_log(job_name, started_at DESC);

-- ─── Function to log cron job results ──────────────────────

CREATE OR REPLACE FUNCTION public.log_due_date_reminder_execution(
  p_status TEXT,
  p_notifications_sent INT DEFAULT 0,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.cron_job_log (
    job_name,
    status,
    notifications_sent,
    error_message,
    completed_at
  )
  VALUES (
    'due-date-reminders',
    p_status,
    p_notifications_sent,
    p_error_message,
    CASE WHEN p_status != 'pending' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ─── RLS Policies ──────────────────────────────────────────

ALTER TABLE public.cron_job_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can view cron logs
CREATE POLICY "cron_log_admin_view"
  ON public.cron_job_log FOR SELECT
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- ─── Comments ──────────────────────────────────────────────

COMMENT ON TABLE public.cron_job_log IS
  'Audit trail of due date reminder cron job executions and results.';

COMMENT ON FUNCTION public.log_due_date_reminder_execution(TEXT, INT, TEXT) IS
  'Records the result of a due date reminder cron execution. Called by the edge function.';

-- ─── Manual Trigger Function ──────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_due_date_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function can be called manually for testing:
  -- SELECT public.trigger_due_date_reminders();
  -- The actual HTTP call to the edge function must be done externally
  -- or via a webhook trigger configured in Supabase Dashboard

  INSERT INTO public.activity_log (user_id, action, entity_type)
  VALUES (
    NULL,
    'due_date_reminders_triggered',
    'notification'
  );
END;
$$;

COMMENT ON FUNCTION public.trigger_due_date_reminders() IS
  'Manually trigger due date reminder notifications. Normally called by cron job.';
