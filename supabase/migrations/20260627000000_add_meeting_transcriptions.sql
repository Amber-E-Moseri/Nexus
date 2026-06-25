-- Phase 3a: AI Transcription & Processing
-- Table for storing transcription inputs and Claude API outputs

CREATE TABLE meeting_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

  -- Input source
  input_type TEXT NOT NULL CHECK (input_type IN ('audio', 'transcript', 'notes')),
  input_file_name TEXT,
  input_file_size INTEGER,

  -- Claude API outputs
  summary TEXT,
  key_points TEXT[],
  decisions TEXT[],
  extracted_action_items JSONB DEFAULT '[]'::jsonb,

  -- Processing metadata
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'error')),
  processing_time_seconds INTEGER,
  tokens_used INTEGER,
  error_message TEXT,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_transcriptions_meeting_id ON meeting_transcriptions(meeting_id);
CREATE INDEX idx_transcriptions_status ON meeting_transcriptions(status);
CREATE INDEX idx_transcriptions_created_by ON meeting_transcriptions(created_by);
CREATE INDEX idx_transcriptions_created_at ON meeting_transcriptions(created_at DESC);

-- Enable RLS
ALTER TABLE meeting_transcriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Users can view their own transcriptions
CREATE POLICY "users_view_own_transcriptions" ON meeting_transcriptions
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'organizational_rep_secretary'
    )
  );

-- ORS can view all transcriptions
CREATE POLICY "ors_view_all_transcriptions" ON meeting_transcriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.user_id = auth.uid()
        AND org_members.role = 'organizational_rep_secretary'
    )
  );

-- Users can create transcriptions for their own meetings
CREATE POLICY "users_create_transcriptions" ON meeting_transcriptions
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings
      WHERE meetings.id = meeting_id
        AND (
          meetings.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_members
            WHERE org_members.user_id = auth.uid()
              AND org_members.role = 'organizational_rep_secretary'
          )
        )
    )
  );

-- Only creator can update their transcriptions
CREATE POLICY "users_update_own_transcriptions" ON meeting_transcriptions
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Only creator can delete their transcriptions
CREATE POLICY "users_delete_own_transcriptions" ON meeting_transcriptions
  FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- Sample extracted_action_items structure (JSONB)
-- ============================================================================
-- [
--   {
--     "action": "Confirm Q3 graduation venue",
--     "owner": "Sarah",
--     "dueDate": "2026-06-18",
--     "priority": "high"
--   },
--   {
--     "action": "Check catering options",
--     "owner": "David",
--     "dueDate": null,
--     "priority": "medium"
--   }
-- ]
