-- ============================================================
-- Add user_sync_settings table for Google Calendar sync configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS user_sync_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  task_sync_enabled BOOLEAN DEFAULT false,
  task_window_months INT DEFAULT 1,
  sync_followed_tasks BOOLEAN DEFAULT false,
  google_calendar_id TEXT DEFAULT 'primary',
  ministry_calendar_subscribed BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add RLS
ALTER TABLE user_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sync_settings_isolation"
  ON user_sync_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Verify
-- SELECT COUNT(*) FROM user_sync_settings;
