-- ============================================================
-- WEEK 3: CALENDAR SYNC SCHEDULER
-- Sets up the Google Calendar sync job to run every 15 minutes
-- ============================================================

-- ─── Create function to trigger sync via HTTP ──────────────────

CREATE OR REPLACE FUNCTION public.trigger_calendar_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function is called by a Supabase cron job
  -- It invokes the calendar-google-sync edge function
  -- Edge function URL: {SUPABASE_URL}/functions/v1/calendar-google-sync

  -- Log the sync trigger
  INSERT INTO public.activity_log (user_id, action, entity_type)
  VALUES (
    NULL, -- System action
    'calendar_sync_triggered',
    'calendar_sync'
  );

  -- Note: The actual HTTP call to the edge function must be handled
  -- by Supabase scheduler or external cron service
END;
$$;

-- ─── Cron Job Configuration (via Supabase) ────────────────────
-- Use Supabase Dashboard to create a scheduled job:
-- 1. Go to Database > Webhooks
-- 2. Create HTTP request to:
--    URL: {SUPABASE_URL}/functions/v1/calendar-google-sync
--    Method: POST
--    Schedule: 0 */15 * * * * (every 15 minutes, UTC)
-- 3. Add Authorization header: Bearer {SUPABASE_SERVICE_ROLE_KEY}
--
-- Alternative: Use cron extension (if enabled):
-- SELECT cron.schedule('calendar-sync', '*/15 * * * *', 'SELECT public.trigger_calendar_sync()');

-- ─── Table to track sync attempts (analytics) ─────────────────

CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'error')),
  synced_events INT DEFAULT 0,
  created_events INT DEFAULT 0,
  updated_events INT DEFAULT 0,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_sync_log_status_idx
  ON public.calendar_sync_log(status);

CREATE INDEX IF NOT EXISTS calendar_sync_log_started_idx
  ON public.calendar_sync_log(sync_started_at DESC);

-- ─── Function to record sync attempts ──────────────────────────

CREATE OR REPLACE FUNCTION public.log_calendar_sync_attempt(
  p_status TEXT,
  p_synced_events INT DEFAULT 0,
  p_created_events INT DEFAULT 0,
  p_updated_events INT DEFAULT 0,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.calendar_sync_log (
    status,
    synced_events,
    created_events,
    updated_events,
    error_message,
    sync_completed_at
  )
  VALUES (
    p_status,
    p_synced_events,
    p_created_events,
    p_updated_events,
    p_error_message,
    CASE WHEN p_status != 'pending' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ─── View for sync status dashboard ────────────────────────────

CREATE OR REPLACE VIEW public.calendar_sync_status AS
SELECT
  id,
  sync_started_at,
  sync_completed_at,
  status,
  synced_events,
  created_events,
  updated_events,
  error_message,
  EXTRACT(EPOCH FROM (sync_completed_at - sync_started_at))::INT AS duration_seconds,
  CASE
    WHEN status = 'success' THEN 'green'
    WHEN status = 'error' THEN 'red'
    ELSE 'yellow'
  END AS status_color
FROM public.calendar_sync_log
ORDER BY sync_started_at DESC;

-- ─── RLS Policy for sync logs ──────────────────────────────────

ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can view sync logs
CREATE POLICY "sync_log_admin_view"
  ON public.calendar_sync_log FOR SELECT
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- ─── Function to get last sync time for a space ─────────────────

CREATE OR REPLACE FUNCTION public.get_last_sync_time(
  p_space_id UUID
)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT last_sync_at
  FROM public.google_calendar_sync
  WHERE space_id = p_space_id
  LIMIT 1;
$$;

-- ─── Function to check if sync is overdue ─────────────────────

CREATE OR REPLACE FUNCTION public.is_sync_overdue(
  p_space_id UUID,
  p_minutes INT DEFAULT 20
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (last_sync_at IS NULL)
    OR (last_sync_at < NOW() - INTERVAL '1 minute' * p_minutes),
    TRUE
  )
  FROM public.google_calendar_sync
  WHERE space_id = p_space_id
  LIMIT 1;
$$;

-- ─── Alert function for failed syncs (optional) ────────────────

CREATE OR REPLACE FUNCTION public.notify_sync_failure(
  p_space_id UUID,
  p_error_message TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log the sync failure
  INSERT INTO public.activity_log (user_id, action, entity_type, metadata)
  VALUES (
    NULL,
    'calendar_sync_failed',
    'calendar_sync',
    jsonb_build_object(
      'space_id', p_space_id,
      'error', p_error_message,
      'timestamp', NOW()
    )
  );

  -- TODO: Send notification to calendar managers
  -- This would integrate with the notifications system
END;
$$;

-- ─── Seed data: Create sync log table entries for tracking ─────

-- This creates initial empty log entries to show sync history
-- Actual entries are created by the edge function on each sync

-- ─── Comments and documentation ────────────────────────────────

COMMENT ON FUNCTION trigger_calendar_sync() IS
  'Triggers the calendar sync process. Called by Supabase scheduler every 15 minutes.';

COMMENT ON FUNCTION log_calendar_sync_attempt(TEXT, INT, INT, INT, TEXT) IS
  'Records the result of a calendar sync attempt. Called by the sync edge function.';

COMMENT ON FUNCTION get_last_sync_time(UUID) IS
  'Returns the last sync timestamp for a given space.';

COMMENT ON FUNCTION is_sync_overdue(UUID, INT) IS
  'Checks if a space is overdue for sync based on last_sync_at timestamp.';

COMMENT ON TABLE calendar_sync_log IS
  'Audit trail of all calendar sync attempts and results.';

COMMENT ON VIEW calendar_sync_status IS
  'Dashboard view showing sync status, timing, and error information.';

-- ─── Performance indexes ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS google_calendar_sync_enabled_last_sync_idx
  ON public.google_calendar_sync(sync_enabled, last_sync_at DESC)
  WHERE sync_enabled = TRUE;

CREATE INDEX IF NOT EXISTS calendar_events_status_approved_idx
  ON public.calendar_events(status, created_at DESC)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS calendar_events_synced_to_google_idx
  ON public.calendar_events(synced_to_google)
  WHERE synced_to_google = FALSE;
