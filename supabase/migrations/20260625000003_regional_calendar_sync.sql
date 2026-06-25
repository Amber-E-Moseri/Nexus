-- ============================================================
-- Regional Ministry Calendar Integration
-- Allows syncing external regional/affiliate calendars
-- ============================================================

-- Create regional_calendar_syncs table
CREATE TABLE IF NOT EXISTS public.regional_calendar_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Regional calendar details
  regional_calendar_name TEXT NOT NULL,
  regional_calendar_url TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#FF6B6B',

  -- Sync configuration
  sync_direction TEXT DEFAULT 'from_google' CHECK (sync_direction IN ('to_google', 'from_google', 'both')),
  is_active BOOLEAN DEFAULT TRUE,

  -- Sync tracking
  last_synced_at TIMESTAMPTZ,
  synced_count INTEGER DEFAULT 0,

  -- Audit trail
  connected_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_regional_sync UNIQUE(org_id, regional_calendar_url)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS regional_calendar_syncs_org_idx
  ON public.regional_calendar_syncs(org_id);

CREATE INDEX IF NOT EXISTS regional_calendar_syncs_active_idx
  ON public.regional_calendar_syncs(is_active, org_id);

-- Add is_regional flag to calendar_events
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_regional BOOLEAN DEFAULT FALSE;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS regional_sync_id UUID REFERENCES public.regional_calendar_syncs(id) ON DELETE SET NULL;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_admin_created BOOLEAN DEFAULT FALSE;

-- Add indexes for regional events
CREATE INDEX IF NOT EXISTS calendar_events_is_regional_idx
  ON public.calendar_events(is_regional, is_active);

CREATE INDEX IF NOT EXISTS calendar_events_regional_sync_id_idx
  ON public.calendar_events(regional_sync_id);

-- Enable RLS
ALTER TABLE public.regional_calendar_syncs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for regional_calendar_syncs
-- Super admin can manage all regional syncs
CREATE POLICY "super_admin_regional_sync"
  ON public.regional_calendar_syncs
  FOR ALL
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- Programs managers can manage org regional syncs
CREATE POLICY "programs_manager_regional_sync"
  ON public.regional_calendar_syncs
  FOR ALL
  USING (
    auth.jwt() ->> 'user_role' = 'super_admin'
    OR (
      EXISTS (
        SELECT 1 FROM public.departments
        WHERE id IN (
          SELECT space_id FROM public.calendar_permissions
          WHERE user_id = auth.uid() AND can_manage = TRUE
        )
        AND name = 'Programs'
      )
    )
  );

-- Everyone can read active regional events
CREATE POLICY "everyone_regional_events"
  ON public.calendar_events
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND is_regional = TRUE
    AND status = 'approved'
  );

-- Update trigger for regional_calendar_syncs
CREATE OR REPLACE FUNCTION public.update_regional_sync_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_regional_sync_timestamp_trigger ON public.regional_calendar_syncs;
CREATE TRIGGER update_regional_sync_timestamp_trigger
  BEFORE UPDATE ON public.regional_calendar_syncs
  FOR EACH ROW
  EXECUTE FUNCTION update_regional_sync_timestamp();
