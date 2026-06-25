-- Add calendar_event_id to meetings table for Phase 2b (Calendar Sync)
ALTER TABLE meetings ADD COLUMN calendar_event_id TEXT UNIQUE;

-- Add index for reverse lookups
CREATE INDEX idx_meetings_calendar_event_id ON meetings(calendar_event_id) WHERE calendar_event_id IS NOT NULL;

-- Add task_id to meeting_action_items table for Phase 2c (Action Items Bridge)
ALTER TABLE meeting_action_items ADD COLUMN task_id TEXT UNIQUE;

-- Add index for reverse lookups
CREATE INDEX idx_action_items_task_id ON meeting_action_items(task_id) WHERE task_id IS NOT NULL;

-- ============================================================================
-- RLS Policy: Allow users to link action items to tasks
-- ============================================================================

-- Only ORS can update action items to link tasks
CREATE POLICY "ORS can link action items to tasks"
  ON meeting_action_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'organizational_rep_secretary'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'organizational_rep_secretary'
    )
  );
