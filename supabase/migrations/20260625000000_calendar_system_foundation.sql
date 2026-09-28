-- ============================================================
-- WEEK 1: CALENDAR SYSTEM FOUNDATION
-- Creates the core infrastructure for Ministry Calendar & Sprint Management
-- ============================================================

-- ─── Ensure Programs and Admin Spaces Exist ─────────────────────

-- FIX: Original referenced organizations table (never exists), departments.organization_id
-- (not yet added), and departments.slug (never added). Rewritten to use actual schema.
INSERT INTO public.departments (id, name, space_type, visibility, status)
VALUES (gen_random_uuid(), 'Programs', 'department', 'org', 'active')
ON CONFLICT (name) DO NOTHING;

-- ─── Add Google Sync Fields to calendar_events ──────────────────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS synced_to_google BOOLEAN DEFAULT FALSE;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS synced_from_google BOOLEAN DEFAULT FALSE;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add index for Google event lookups
CREATE INDEX IF NOT EXISTS calendar_events_google_event_id_idx
  ON public.calendar_events(google_event_id)
  WHERE google_event_id IS NOT NULL;

-- ─── Create Google Calendar Sync Table ──────────────────────────

CREATE TABLE IF NOT EXISTS public.google_calendar_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID, -- FIX: removed FK to public.organizations (table never exists; single-tenant)
  space_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,

  -- Google OAuth credentials (encrypted in application layer)
  google_calendar_id TEXT NOT NULL,
  google_access_token TEXT,
  google_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Sync configuration
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction TEXT DEFAULT 'both' CHECK (sync_direction IN ('to_google', 'from_google', 'both')),
  last_sync_at TIMESTAMPTZ,

  -- Audit trail
  connected_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_google_sync UNIQUE(org_id, space_id, google_calendar_id)
);

-- Add indexes for google_calendar_sync
CREATE INDEX IF NOT EXISTS google_calendar_sync_org_space_idx
  ON public.google_calendar_sync(org_id, space_id);

CREATE INDEX IF NOT EXISTS google_calendar_sync_enabled_idx
  ON public.google_calendar_sync(sync_enabled, last_sync_at DESC);

-- ─── Enable RLS on New Tables ──────────────────────────────────

ALTER TABLE public.google_calendar_sync ENABLE ROW LEVEL SECURITY;

-- ─── Create calendar_permissions Table (if not exists) ──────────

CREATE TABLE IF NOT EXISTS public.calendar_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  org_id UUID, -- FIX: removed FK to public.organizations (table never exists; dropped by 20270101000007)
  space_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  can_manage BOOLEAN DEFAULT FALSE,
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_calendar_permission UNIQUE(user_id, space_id)
);

CREATE INDEX IF NOT EXISTS calendar_permissions_user_idx
  ON public.calendar_permissions(user_id);

CREATE INDEX IF NOT EXISTS calendar_permissions_space_idx
  ON public.calendar_permissions(space_id);

CREATE INDEX IF NOT EXISTS calendar_permissions_can_manage_idx
  ON public.calendar_permissions(can_manage);

ALTER TABLE public.calendar_permissions ENABLE ROW LEVEL SECURITY;

-- ─── Update calendar_subscriptions to match spec ─────────────────
-- GUARD: calendar_subscriptions created later by 20260730000000.
-- These columns are dead (reverted outside migration history per 20261107000002 notes).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'calendar_subscriptions' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT ARRAY[]::TEXT[]';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS org_id UUID';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.departments(id) ON DELETE CASCADE';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.calendar_subscriptions ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0';
    EXECUTE 'CREATE INDEX IF NOT EXISTS calendar_subscriptions_org_space_idx ON public.calendar_subscriptions(org_id, space_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS calendar_subscriptions_access_count_idx ON public.calendar_subscriptions(access_count DESC)';
  END IF;
END;
$$;

-- ─── Add event_priority to calendar_events (for filtering) ─────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low'));

-- Add index for priority filtering
CREATE INDEX IF NOT EXISTS calendar_events_priority_idx
  ON public.calendar_events(priority);

-- ─── Add duration_days field to calendar_events ────────────────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 1;

-- ─── RLS Policies for google_calendar_sync ──────────────────────

-- Programs Managers can manage Programs space sync
CREATE POLICY "programs_manager_google_sync"
  ON public.google_calendar_sync
  FOR ALL
  USING (
    space_id IN (
      SELECT id FROM public.departments
      WHERE name = 'Programs' AND space_type = 'department'
    )
    AND (
      auth.jwt() ->> 'user_role' = 'super_admin'
      OR connected_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.calendar_permissions
        WHERE user_id = auth.uid()
          AND space_id = google_calendar_sync.space_id
          AND can_manage = TRUE
      )
    )
  );

-- Admin Managers can manage Admin space sync
CREATE POLICY "admin_manager_google_sync"
  ON public.google_calendar_sync
  FOR ALL
  USING (
    space_id IN (
      SELECT id FROM public.departments
      WHERE name = 'Admin' AND space_type = 'department'
    )
    AND (
      auth.jwt() ->> 'user_role' = 'super_admin'
      OR connected_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.calendar_permissions
        WHERE user_id = auth.uid()
          AND space_id = google_calendar_sync.space_id
          AND can_manage = TRUE
      )
    )
  );

-- ─── RLS Policies for calendar_permissions ──────────────────────

CREATE POLICY "calendar_permissions_admin_only"
  ON public.calendar_permissions
  FOR ALL
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

CREATE POLICY "calendar_permissions_view_own"
  ON public.calendar_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── Enhanced RLS Policies for calendar_events ────────────────────

-- Drop old basic policies and create new ones
DROP POLICY IF EXISTS "calendar_events_select_all" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_write" ON public.calendar_events;

-- Programs Managers can fully manage Programs space events
CREATE POLICY "programs_manager_events"
  ON public.calendar_events
  FOR ALL
  USING (
    space_id IN (
      SELECT id FROM public.departments
      WHERE name = 'Programs' AND space_type = 'department'
    )
    AND (
      auth.jwt() ->> 'user_role' = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.calendar_permissions
        WHERE user_id = auth.uid()
          AND space_id = calendar_events.space_id
          AND can_manage = TRUE
      )
    )
  );

-- Admin Managers can fully manage Admin space events
CREATE POLICY "admin_manager_events"
  ON public.calendar_events
  FOR ALL
  USING (
    space_id IN (
      SELECT id FROM public.departments
      WHERE name = 'Admin' AND space_type = 'department'
    )
    AND (
      auth.jwt() ->> 'user_role' = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.calendar_permissions
        WHERE user_id = auth.uid()
          AND space_id = calendar_events.space_id
          AND can_manage = TRUE
      )
    )
  );

-- Regional Secretary can READ all spaces (read-only)
CREATE POLICY "regional_secretary_view"
  ON public.calendar_events
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.calendar_permissions
      WHERE user_id = auth.uid()
        AND can_manage = FALSE  -- Regional Secretary has no manage permission
    )
  );

-- Everyone can view approved events
-- GUARD: status added by 20260726000001, is_org_wide by 20260805000002.
-- Policy superseded by 20261107000002_calendar_soft_delete.sql.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'status')
  THEN
    EXECUTE $pol$
      CREATE POLICY "everyone_approved_events"
        ON public.calendar_events
        FOR SELECT
        USING (
          auth.role() = 'authenticated'
          AND (status = 'approved' OR is_org_wide = TRUE)
        )
    $pol$;
  END IF;
END;
$$;

-- ─── Indexes for Performance ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS calendar_events_space_date_idx
  ON public.calendar_events(space_id, start_date DESC);

-- GUARD: status column added by 20260726000001.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'status')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS calendar_events_status_space_idx ON public.calendar_events(status, space_id)';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS calendar_events_sprint_idx
  ON public.calendar_events(sprint_id);

CREATE INDEX IF NOT EXISTS calendar_events_created_by_idx
  ON public.calendar_events(created_by);

-- ─── Activity Log for Calendar Audit Trail ────────────────────────

CREATE OR REPLACE FUNCTION public.log_calendar_sync_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.last_sync_at IS NOT NULL AND (OLD.last_sync_at IS NULL OR NEW.last_sync_at > OLD.last_sync_at) THEN
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'calendar_google_sync',
      'google_calendar_sync',
      NEW.id,
      jsonb_build_object(
        'space_id', NEW.space_id,
        'sync_direction', NEW.sync_direction,
        'synced_at', NEW.last_sync_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_calendar_sync_action ON public.google_calendar_sync;
CREATE TRIGGER log_calendar_sync_action
  AFTER UPDATE ON public.google_calendar_sync
  FOR EACH ROW
  EXECUTE FUNCTION public.log_calendar_sync_action();

-- ─── Function to Get Calendar Events for Subscription ────────────
-- GUARD: calendar_subscriptions created later by 20260730000000.
-- get_subscription_events is replaced by 20261107000002.
-- increment_subscription_access has no callers (dead code).
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'calendar_subscriptions' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $fn$
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
        priority TEXT,
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
          ce.priority,
          ce.status,
          ce.sprint_id
        FROM public.calendar_events ce
        INNER JOIN public.calendar_subscriptions cs ON cs.token = p_token
        WHERE cs.token = p_token
          AND ce.space_id = cs.space_id
          AND ce.status IN ('approved', 'confirmed')
          AND (cs.filter_priority IS NULL OR ce.priority = cs.filter_priority)
        ORDER BY ce.start_date DESC
        LIMIT p_limit;
      $$
    $fn$;

    EXECUTE $fn2$
      CREATE OR REPLACE FUNCTION public.increment_subscription_access(p_token TEXT)
      RETURNS VOID
      LANGUAGE SQL
      SECURITY DEFINER
      AS $$
        UPDATE public.calendar_subscriptions
        SET
          access_count = COALESCE(access_count, 0) + 1,
          last_accessed_at = NOW()
        WHERE token = p_token;
      $$
    $fn2$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.increment_subscription_access TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_subscription_events TO anon';
  END IF;
END;
$guard$;
