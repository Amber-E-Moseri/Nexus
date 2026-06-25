-- ============================================================
-- User-Level Integrations
-- Allows individual users to connect their own integrations
-- (Google Calendar, email, Slack, Teams, etc.)
-- ============================================================

-- Create user_integrations table
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Integration details
  integration_type TEXT NOT NULL CHECK (integration_type IN (
    'google_calendar',
    'outlook_calendar',
    'slack',
    'teams',
    'email_forward',
    'zapier',
    'ifttt',
    'custom'
  )),

  integration_name TEXT NOT NULL,
  display_name TEXT,

  -- OAuth credentials (encrypted in application layer)
  oauth_token TEXT,
  oauth_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Configuration
  settings JSONB DEFAULT '{}'::jsonb,

  -- Status and tracking
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  -- Sync configuration (for integrations that sync)
  sync_enabled BOOLEAN DEFAULT FALSE,
  sync_direction TEXT DEFAULT 'both' CHECK (sync_direction IN ('to_external', 'from_external', 'both')),
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT,

  -- Audit trail
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_integration UNIQUE(user_id, integration_type, integration_name)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS user_integrations_user_idx
  ON public.user_integrations(user_id);

CREATE INDEX IF NOT EXISTS user_integrations_active_idx
  ON public.user_integrations(user_id, is_active);

CREATE INDEX IF NOT EXISTS user_integrations_type_idx
  ON public.user_integrations(integration_type);

CREATE INDEX IF NOT EXISTS user_integrations_sync_idx
  ON public.user_integrations(user_id, sync_enabled);

-- Create user_integration_activity table (audit log)
CREATE TABLE IF NOT EXISTS public.user_integration_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN (
    'connected',
    'disconnected',
    'synced',
    'sync_failed',
    'verified',
    'updated',
    'token_refreshed'
  )),

  status TEXT,
  error_message TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS user_integration_activity_user_idx
  ON public.user_integration_activity(user_id);

CREATE INDEX IF NOT EXISTS user_integration_activity_integration_idx
  ON public.user_integration_activity(integration_id);

-- Create user_integration_logs table (for sync logs)
CREATE TABLE IF NOT EXISTS public.user_integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,

  sync_type TEXT,
  direction TEXT,

  items_synced INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS user_integration_logs_integration_idx
  ON public.user_integration_logs(integration_id);

CREATE INDEX IF NOT EXISTS user_integration_logs_created_at_idx
  ON public.user_integration_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integration_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integration_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_integrations
-- Users can only access their own integrations
CREATE POLICY "user_integrations_own"
  ON public.user_integrations
  FOR ALL
  USING (user_id = auth.uid());

-- Super admin can view all user integrations
CREATE POLICY "user_integrations_admin"
  ON public.user_integrations
  FOR SELECT
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- RLS Policies for user_integration_activity
CREATE POLICY "user_integration_activity_own"
  ON public.user_integration_activity
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_integration_activity_admin"
  ON public.user_integration_activity
  FOR SELECT
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- RLS Policies for user_integration_logs
CREATE POLICY "user_integration_logs_own"
  ON public.user_integration_logs
  FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM public.user_integrations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "user_integration_logs_admin"
  ON public.user_integration_logs
  FOR SELECT
  USING (auth.jwt() ->> 'user_role' = 'super_admin');

-- Update trigger for timestamps
CREATE OR REPLACE FUNCTION public.update_user_integration_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_integration_timestamp_trigger ON public.user_integrations;
CREATE TRIGGER update_user_integration_timestamp_trigger
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_user_integration_timestamp();

-- Function to add integration activity log
CREATE OR REPLACE FUNCTION public.log_user_integration_activity(
  p_user_id UUID,
  p_integration_id UUID,
  p_action TEXT,
  p_status TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_integration_activity (
    user_id, integration_id, action, status, error_message, metadata
  ) VALUES (p_user_id, p_integration_id, p_action, p_status, p_error_message, p_metadata);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.log_user_integration_activity TO authenticated;
