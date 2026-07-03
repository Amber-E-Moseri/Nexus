-- ============================================================
-- Add calendar_event_tags and calendar_tags for Ministry Calendar visibility control
-- ============================================================

-- Tags applied to specific calendar events
CREATE TABLE IF NOT EXISTS calendar_event_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  visible_to JSONB NOT NULL DEFAULT '["everyone"]',
  -- visible_to examples:
  -- ["everyone"] = all authenticated users
  -- ["media", "admin"] = only these departments
  -- ["regional_secretary", "super_admin"] = only these roles
  -- ["ors"] = only ORS feature role
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Predefined tags (reusable across events)
CREATE TABLE IF NOT EXISTS calendar_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name TEXT UNIQUE NOT NULL,
  visible_to JSONB NOT NULL DEFAULT '["everyone"]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_event_tags_event_id
ON calendar_event_tags(event_id);

CREATE INDEX IF NOT EXISTS idx_calendar_event_tags_visible_to
ON calendar_event_tags USING GIN(visible_to);

-- RLS: Everyone can read, only event creator can write
ALTER TABLE calendar_event_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_event_tags_read"
  ON calendar_event_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "calendar_event_tags_creator_write"
  ON calendar_event_tags FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Verify
-- SELECT COUNT(*) FROM calendar_event_tags;
-- SELECT COUNT(*) FROM calendar_tags;
