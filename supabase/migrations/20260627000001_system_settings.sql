-- System Settings table for AI processing cost controls

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (key, value, description) VALUES
  ('ai_processing_enabled', 'true', 'Enable/disable AI transcription processing'),
  ('ai_daily_spend_limit', '0.50', 'Daily spending limit in dollars'),
  ('ai_daily_process_limit', '50', 'Max transcriptions per day'),
  ('ai_max_transcript_chars', '50000', 'Max characters per transcript'),
  ('ai_cost_warning_threshold', '0.30', 'Daily spend warning threshold'),
  ('ai_enable_notifications', 'true', 'Send cost limit notifications')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view settings
CREATE POLICY "admins_view_settings" ON system_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'administrator'
    )
  );

-- Only admins can update settings
CREATE POLICY "admins_update_settings" ON system_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'administrator'
    )
  );

-- Create audit log table
CREATE TABLE system_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit trigger
CREATE OR REPLACE FUNCTION log_setting_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO system_settings_audit (key, old_value, new_value, changed_by)
  VALUES (NEW.key, OLD.value, NEW.value, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER system_settings_audit_trigger
AFTER UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION log_setting_change();

-- Index for audit lookups
CREATE INDEX idx_audit_changed_at ON system_settings_audit(changed_at DESC);
