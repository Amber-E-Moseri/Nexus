-- ============================================================
-- Sync Dead-Letter Table
-- Persists Google Calendar sync failures that exhausted all
-- retries, so super_admins can review and re-trigger them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sync_failures (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL    DEFAULT NOW(),

  -- Who / what failed
  user_id        UUID        REFERENCES auth.users ON DELETE SET NULL,
  space_id       UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  event_id       UUID,                      -- local calendar_events.id (nullable)
  google_event_id TEXT,                     -- Google's event ID if available

  -- Error detail
  error_code     INT,                       -- HTTP status code, NULL for network errors
  error_message  TEXT,

  -- Full request payload so the sync can be re-driven
  payload        JSONB       NOT NULL DEFAULT '{}',

  -- Retry tracking
  retry_count    INT         NOT NULL DEFAULT 0,
  last_retried_at TIMESTAMPTZ,

  -- Resolution
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  resolution_note TEXT
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS sync_failures_created_at_idx
  ON public.sync_failures(created_at DESC);

CREATE INDEX IF NOT EXISTS sync_failures_space_id_idx
  ON public.sync_failures(space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sync_failures_unresolved_idx
  ON public.sync_failures(created_at DESC)
  WHERE resolved_at IS NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.sync_failures ENABLE ROW LEVEL SECURITY;

-- Super admin sees everything
CREATE POLICY "sync_failures_super_admin_all"
  ON public.sync_failures
  FOR ALL
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- Users can see their own failures (for personal sync operations)
CREATE POLICY "sync_failures_own_select"
  ON public.sync_failures
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- ── Helper: mark a failure resolved ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_sync_failure(
  p_failure_id  UUID,
  p_note        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.sync_failures
  SET
    resolved_at   = NOW(),
    resolved_by   = auth.uid(),
    resolution_note = p_note
  WHERE id = p_failure_id
    AND resolved_at IS NULL;
END;
$$;

COMMENT ON TABLE  public.sync_failures IS
  'Dead-letter table for Google Calendar sync operations that exhausted all retries.';
COMMENT ON COLUMN public.sync_failures.payload IS
  'Full JSON payload of the failed sync call — sufficient to re-drive it.';
COMMENT ON COLUMN public.sync_failures.retry_count IS
  'Number of retry attempts made before giving up (not counting the first attempt).';
