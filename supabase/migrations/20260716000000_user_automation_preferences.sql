-- Allow all users to read org-wide (null dept) automations
-- The existing automations_select policy only matches department_id = current_user_department().
-- We update it to also include automations with no department (org-wide).
DROP POLICY IF EXISTS "automations_select" ON public.automations;
CREATE POLICY "automations_select" ON public.automations
  FOR SELECT TO authenticated
  USING (
    department_id IS NULL  -- org-wide: visible to everyone
    OR public.current_user_can_bypass_department()
    OR department_id = public.current_user_department()
    OR sprint_id IN (
      SELECT sprint_id FROM public.sprint_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- User-level automation preferences: opt-in/out per automation, email opt-in, daily email cap
CREATE TABLE IF NOT EXISTS user_automation_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id   uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT true,
  -- email_opted_in: user must explicitly enable email-type actions for this automation
  email_opted_in  boolean NOT NULL DEFAULT false,
  -- max_emails_per_day: 0 = unlimited (only respected when email_opted_in = true)
  max_emails_per_day integer NOT NULL DEFAULT 3,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, automation_id)
);

ALTER TABLE user_automation_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read and manage their own preferences
CREATE POLICY "users_own_automation_prefs" ON user_automation_preferences
  FOR ALL USING (user_id = auth.uid());

-- Track daily email sends to enforce per-user batching limits
CREATE TABLE IF NOT EXISTS automation_email_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  subject       text,
  recipient     text
);

ALTER TABLE automation_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_email_log" ON automation_email_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_insert_email_log" ON automation_email_log
  FOR INSERT WITH CHECK (true);

-- Index for fast daily count queries
CREATE INDEX automation_email_log_daily ON automation_email_log (user_id, automation_id, sent_at);

-- Helper function: check if user has hit their daily email limit for an automation
CREATE OR REPLACE FUNCTION user_email_limit_reached(p_user_id uuid, p_automation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (
      SELECT COUNT(*) >= COALESCE(p.max_emails_per_day, 3)
      FROM automation_email_log l
      JOIN user_automation_preferences p
        ON p.user_id = l.user_id AND p.automation_id = l.automation_id
      WHERE l.user_id = p_user_id
        AND l.automation_id = p_automation_id
        AND l.sent_at >= NOW() - INTERVAL '24 hours'
      GROUP BY p.max_emails_per_day
    ),
    false
  );
$$;
