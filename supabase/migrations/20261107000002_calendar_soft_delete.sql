-- ============================================================
-- Calendar Soft Delete
-- Adds deleted_at to calendar_events so deletions in Nexus
-- propagate to Google Calendar (outbound) and deletions in
-- Google are reflected back here (inbound).
-- ============================================================

-- ─── 1. Add deleted_at column ────────────────────────────────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ─── 2. Index for efficient "not deleted" filtering ──────────

CREATE INDEX IF NOT EXISTS calendar_events_deleted_at_idx
  ON public.calendar_events(deleted_at)
  WHERE deleted_at IS NULL;

-- ─── 3. Index for "pending outbound deletion" sync queries ───
-- NOTE (2026-11-07 push): synced_to_google does not exist on the live
-- calendar_events table (the whole Google-sync column set from
-- 20260625000000 was reverted outside of migration history — see
-- docs/audits/CALENDAR_SYNC_AUDIT.md). Indexing on the columns that do
-- exist instead; Phase 1 reintroduces per-source sync tracking.

CREATE INDEX IF NOT EXISTS calendar_events_pending_goog_delete_idx
  ON public.calendar_events(deleted_at, google_event_id)
  WHERE deleted_at IS NOT NULL AND google_event_id IS NOT NULL;

-- ─── 4. Patch RLS SELECT policies to exclude soft-deleted rows ─
-- Each existing SELECT policy is dropped and recreated with
-- AND deleted_at IS NULL appended to its USING clause.
-- INSERT/UPDATE/DELETE policies are intentionally left as-is
-- so the sync engine (service role) can still touch the row.

-- 4a. "everyone_approved_events" (created in 20260625000000)
DROP POLICY IF EXISTS "everyone_approved_events" ON public.calendar_events;
CREATE POLICY "everyone_approved_events"
  ON public.calendar_events
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (status = 'approved' OR is_org_wide = TRUE)
    AND deleted_at IS NULL
  );

-- 4b. "regional_secretary_view" (created in 20260625000000)
DROP POLICY IF EXISTS "regional_secretary_view" ON public.calendar_events;
CREATE POLICY "regional_secretary_view"
  ON public.calendar_events
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.calendar_permissions
      WHERE user_id = auth.uid()
        AND can_manage = FALSE
    )
    AND deleted_at IS NULL
  );

-- 4c. "everyone_regional_events" (created in 20260625000003)
-- NOTE (2026-11-07 push): is_regional / regional_calendar_syncs were
-- reverted outside of migration history (see docs/audits/CALENDAR_SYNC_AUDIT.md).
-- Only dropping the stale policy; not recreating it since the column it
-- depends on no longer exists.
DROP POLICY IF EXISTS "everyone_regional_events" ON public.calendar_events;

-- 4d. Space-manager policies use FOR ALL (covers SELECT + write).
-- We keep them as FOR ALL so managers can still read deleted rows
-- for auditing, but add a dedicated FOR SELECT policy that
-- excludes deleted rows for non-manager reads.
-- (No change needed to "programs_manager_events" /
--  "admin_manager_events" — managers may legitimately need to
--  see soft-deleted rows to confirm deletion propagated.)

-- ─── 5. get_subscription_events — exclude soft-deleted rows ──
-- NOTE (2026-11-07 push): rewritten against the live schema, which has
-- neither calendar_events.priority/space_id nor
-- calendar_subscriptions.space_id/filter_priority (that whole column set
-- was reverted outside of migration history — see
-- docs/audits/CALENDAR_SYNC_AUDIT.md). No callers exist anywhere in the
-- codebase for this RPC; fixed to match reality rather than removed.

CREATE OR REPLACE FUNCTION public.get_subscription_events(
  p_token TEXT,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT,
  sprint_id UUID
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    ce.id,
    ce.title,
    ce.description,
    ce.start_date,
    ce.end_date,
    ce.status,
    ce.sprint_id
  FROM public.calendar_events ce
  INNER JOIN public.calendar_subscriptions cs ON cs.token = p_token
  WHERE cs.token = p_token
    AND ce.department_id IS NOT DISTINCT FROM cs.dept_id
    AND ce.status IN ('approved', 'confirmed')
    AND ce.deleted_at IS NULL
  ORDER BY ce.start_date DESC
  LIMIT p_limit;
$$;
