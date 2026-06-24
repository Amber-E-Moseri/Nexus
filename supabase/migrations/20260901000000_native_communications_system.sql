-- ============================================================
-- NATIVE IN-APP COMMUNICATIONS SYSTEM
-- ============================================================
-- Phase 1: Database Schema
-- Date: 2026-09-01
-- Purpose: Add in-app notification inbox + broadcast campaigns
-- Backward compatible: Email system unchanged
-- ============================================================

-- 1. TABLE: app_notifications
-- ============================================================
-- Stores all in-app notifications for users
-- Real-time enabled for instant updates
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type                text NOT NULL DEFAULT 'broadcast'
                      CHECK (type IN ('broadcast', 'direct', 'system', 'alert', 'invite')),
  title               text NOT NULL,
  body                text NOT NULL,
  body_html           text,
  icon_url            text,
  action_url          text,
  related_campaign_id uuid,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  read_at             timestamptz,
  dismissed_at        timestamptz,
  priority            text NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  email_sent          boolean NOT NULL DEFAULT false,
  expires_at          timestamptz DEFAULT (now() + INTERVAL '90 days'),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_app_notifications_recipient_user_id
  ON public.app_notifications(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_app_notifications_read_at
  ON public.app_notifications(read_at);

CREATE INDEX IF NOT EXISTS idx_app_notifications_recipient_created_desc
  ON public.app_notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_notifications_campaign_id
  ON public.app_notifications(related_campaign_id);

CREATE INDEX IF NOT EXISTS idx_app_notifications_expires_at
  ON public.app_notifications(expires_at);

-- Enable Realtime for instant push updates
ALTER TABLE public.app_notifications REPLICA IDENTITY FULL;

-- RLS: Users can SELECT own notifications only
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_notifications" ON public.app_notifications;
CREATE POLICY "users_select_own_notifications"
  ON public.app_notifications FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "admins_insert_notifications" ON public.app_notifications;
CREATE POLICY "admins_insert_notifications"
  ON public.app_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('super_admin', 'dept_lead')
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "users_update_own_notifications" ON public.app_notifications;
CREATE POLICY "users_update_own_notifications"
  ON public.app_notifications FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

COMMENT ON TABLE public.app_notifications IS
'In-app notifications shown in user inbox. Supports multiple types: broadcast campaigns, direct messages, system alerts. Real-time enabled for instant updates.';

COMMENT ON COLUMN public.app_notifications.type IS
'broadcast (from campaigns), direct (person-to-person), system (automated), alert (urgent), invite (onboarding)';

COMMENT ON COLUMN public.app_notifications.priority IS
'Affects badge color in UI: low (gray), normal (blue), high (orange), urgent (red)';

COMMENT ON COLUMN public.app_notifications.expires_at IS
'Notifications auto-deleted after 90 days via cleanup_old_notifications() trigger';

-- ============================================================
-- 2. TABLE: broadcast_campaigns
-- ============================================================
-- Manages broadcast campaign metadata and stats
CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  body_html           text,
  icon_url            text,
  recipient_filters   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'broadcast', 'failed')),
  scheduled_at        timestamptz,
  broadcast_at        timestamptz,
  include_email       boolean NOT NULL DEFAULT false,
  email_subject       text,
  email_template_id   uuid REFERENCES public.communication_email_templates(id) ON DELETE SET NULL,
  sent_count          integer NOT NULL DEFAULT 0,
  read_count          integer NOT NULL DEFAULT 0,
  clicked_count       integer NOT NULL DEFAULT 0,
  created_by          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status
  ON public.broadcast_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created_by
  ON public.broadcast_campaigns(created_by);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_broadcast_at
  ON public.broadcast_campaigns(broadcast_at);

-- RLS: Authenticated users can SELECT all, admins can manage
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_select_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "all_select_broadcast_campaigns"
  ON public.broadcast_campaigns FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admins_insert_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "admins_insert_broadcast_campaigns"
  ON public.broadcast_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('super_admin', 'dept_lead')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "admins_update_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "admins_update_broadcast_campaigns"
  ON public.broadcast_campaigns FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (
      (auth.jwt() ->> 'role') = 'dept_lead'
      AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (
      (auth.jwt() ->> 'role') = 'dept_lead'
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF exists "admins_delete_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "admins_delete_broadcast_campaigns"
  ON public.broadcast_campaigns FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR created_by = auth.uid()
  );

COMMENT ON TABLE public.broadcast_campaigns IS
'Manages broadcast campaigns that send in-app notifications to recipients. Optionally includes email sending. Status tracks send state: draft (editing), broadcast (sent), failed (error).';

COMMENT ON COLUMN public.broadcast_campaigns.recipient_filters IS
'JSONB array of recipient pills: [{"type":"department","deptId":"..."}, {"type":"role","role":"pastor"}, {"type":"individual","email":"..."}]';

COMMENT ON COLUMN public.broadcast_campaigns.scheduled_at IS
'Reserved for future scheduling feature (Phase 2). Currently unused.';

COMMENT ON COLUMN public.broadcast_campaigns.status IS
'draft: editing mode, can be sent. broadcast: successfully sent. failed: send error, can retry. (Note: scheduled status reserved for Phase 2)';

-- Add FK constraint from app_notifications to broadcast_campaigns (deferred to avoid circular dependency)
ALTER TABLE public.app_notifications
  ADD CONSTRAINT fk_app_notifications_broadcast_campaigns
  FOREIGN KEY (related_campaign_id)
  REFERENCES public.broadcast_campaigns(id)
  ON DELETE SET NULL;

-- ============================================================
-- 3. TABLE: notification_preferences
-- ============================================================
-- User settings for delivery channels and quiet hours
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  broadcasts_via_app          boolean NOT NULL DEFAULT true,
  broadcasts_via_email        boolean NOT NULL DEFAULT true,
  system_alerts_via_app       boolean NOT NULL DEFAULT true,
  system_alerts_via_email     boolean NOT NULL DEFAULT false,
  direct_messages_via_app     boolean NOT NULL DEFAULT true,
  direct_messages_via_email   boolean NOT NULL DEFAULT true,
  quiet_hours_enabled         boolean NOT NULL DEFAULT false,
  quiet_hours_start           time DEFAULT '22:00:00'::time,
  quiet_hours_end             time DEFAULT '08:00:00'::time,
  quiet_hours_tz              text DEFAULT 'America/Toronto',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id
  ON public.notification_preferences(user_id);

-- RLS: Users can manage own preferences only
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_preferences" ON public.notification_preferences;
CREATE POLICY "users_manage_own_preferences"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.notification_preferences IS
'User notification settings: which channels to use (app/email) and quiet hours (do not disturb).';

COMMENT ON COLUMN public.notification_preferences.quiet_hours_tz IS
'Timezone for quiet hours calculation. Default America/Toronto. Examples: America/New_York, UTC, Europe/London';

-- ============================================================
-- 4. TABLE: notification_read_state
-- ============================================================
-- Denormalized unread count for performance (avoid COUNT(*) on every request)
CREATE TABLE IF NOT EXISTS public.notification_read_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  unread_count    integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_read_state_user_id
  ON public.notification_read_state(user_id);

-- RLS: Users can manage own read state
ALTER TABLE public.notification_read_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_read_state" ON public.notification_read_state;
CREATE POLICY "users_manage_own_read_state"
  ON public.notification_read_state FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.notification_read_state IS
'Denormalized cache of unread_count per user. Maintained by triggers to avoid expensive COUNT(*) queries on every load.';

-- ============================================================
-- 5. TABLE: communication_unsubscribe_tokens
-- ============================================================
-- Secure random tokens for unsubscribe links (replaces deterministic SHA256)
CREATE TABLE IF NOT EXISTS public.communication_unsubscribe_tokens (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email     text NOT NULL,
  token     text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_communication_unsubscribe_tokens_email
  ON public.communication_unsubscribe_tokens(email);

CREATE INDEX IF NOT EXISTS idx_communication_unsubscribe_tokens_token
  ON public.communication_unsubscribe_tokens(token);

CREATE INDEX IF NOT EXISTS idx_communication_unsubscribe_tokens_expires_at
  ON public.communication_unsubscribe_tokens(expires_at);

-- RLS: Anon can insert, no one can select (function uses SECURITY DEFINER)
ALTER TABLE public.communication_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_unsubscribe_tokens" ON public.communication_unsubscribe_tokens;
CREATE POLICY "anon_insert_unsubscribe_tokens"
  ON public.communication_unsubscribe_tokens FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

COMMENT ON TABLE public.communication_unsubscribe_tokens IS
'Secure random tokens for unsubscribe links. Replaces deterministic SHA256 tokens. Each token is one-time use (used_at field tracks usage). Expires after 30 days.';

-- ============================================================
-- TRIGGER FUNCTIONS
-- ============================================================

-- Function: increment_notification_count
-- Fired: ON INSERT app_notifications
-- Purpose: Increment user unread count when notification created
CREATE OR REPLACE FUNCTION public.increment_notification_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notification_read_state (user_id, unread_count, last_checked_at)
  VALUES (NEW.recipient_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET unread_count = unread_count + 1,
      last_checked_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_notification_count ON public.app_notifications;
CREATE TRIGGER trg_increment_notification_count
  AFTER INSERT ON public.app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_notification_count();

-- Function: decrement_notification_count
-- Fired: ON UPDATE app_notifications (when read_at is set)
-- Purpose: Decrement unread count when user marks as read
CREATE OR REPLACE FUNCTION public.decrement_notification_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only decrement if read_at was NULL and is now set
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
    UPDATE public.notification_read_state
    SET unread_count = GREATEST(0, unread_count - 1)
    WHERE user_id = NEW.recipient_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_notification_count ON public.app_notifications;
CREATE TRIGGER trg_decrement_notification_count
  AFTER UPDATE ON public.app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_notification_count();

-- Function: cleanup_old_notifications
-- Fired: Daily via pg_cron at 3 AM UTC
-- Purpose: Delete notifications older than 90 days (performance + storage)
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.app_notifications
  WHERE created_at < now() - INTERVAL '90 days';
$$;

COMMENT ON FUNCTION public.cleanup_old_notifications() IS
'Scheduled daily to delete notifications older than 90 days. Keeps database lean (notifications are transient, not archival).';

-- Schedule cleanup_old_notifications to run daily at 3 AM UTC
-- Note: pg_cron must be enabled and configured with: SELECT cron.schedule('cleanup_old_notifications', '0 3 * * *', 'SELECT cleanup_old_notifications()');

-- Function: cleanup_expired_unsubscribe_tokens
-- Fired: Daily via pg_cron
-- Purpose: Delete expired tokens to keep table small
CREATE OR REPLACE FUNCTION public.cleanup_expired_unsubscribe_tokens()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.communication_unsubscribe_tokens
  WHERE expires_at < now();
$$;

COMMENT ON FUNCTION public.cleanup_expired_unsubscribe_tokens() IS
'Scheduled daily to delete unsubscribe tokens older than expiry time. Keeps token table clean and performant.';

-- Schedule cleanup_expired_unsubscribe_tokens to run daily at 4 AM UTC
-- Note: SELECT cron.schedule('cleanup_expired_unsubscribe_tokens', '0 4 * * *', 'SELECT cleanup_expired_unsubscribe_tokens()');

-- Function: update_updated_at
-- Fired: BEFORE UPDATE on tables with updated_at columns
-- Purpose: Automatically set updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for broadcast_campaigns.updated_at
DROP TRIGGER IF EXISTS trg_broadcast_campaigns_updated_at ON public.broadcast_campaigns;
CREATE TRIGGER trg_broadcast_campaigns_updated_at
  BEFORE UPDATE ON public.broadcast_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger for notification_preferences.updated_at
DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger for app_notifications.updated_at
DROP TRIGGER IF EXISTS trg_app_notifications_updated_at ON public.app_notifications;
CREATE TRIGGER trg_app_notifications_updated_at
  BEFORE UPDATE ON public.app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- SUMMARY
-- ============================================================
-- Total tables created: 5
--   - app_notifications (in-app notification inbox)
--   - broadcast_campaigns (campaign metadata + stats)
--   - notification_preferences (user settings)
--   - notification_read_state (denormalized unread count)
--   - communication_unsubscribe_tokens (secure tokens)
--
-- Total indexes created: 13
-- Total RLS policies created: 8
-- Total trigger functions created: 5
-- Total triggers created: 6
--
-- Realtime enabled: app_notifications (for instant updates)
-- Scheduled jobs: 2 (cleanup_old_notifications, cleanup_expired_unsubscribe_tokens)
--   - Note: Must manually enable in Supabase UI or via pg_cron extension
--
-- Backward compatibility: 100% ✓
--   - Email system (communication_campaigns, communication_sends) unchanged
--   - New system is additive only (no breaking changes)
