-- Create meeting_transcriptions table
CREATE TABLE meeting_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  input_type TEXT NOT NULL CHECK (input_type IN ('audio', 'text')),
  input_file_name TEXT,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'complete', 'error')),
  tokens_used INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX idx_meeting_transcriptions_meeting_id ON meeting_transcriptions(meeting_id);
CREATE INDEX idx_meeting_transcriptions_created_by ON meeting_transcriptions(created_by);
CREATE INDEX idx_meeting_transcriptions_created_at ON meeting_transcriptions(created_at DESC);

-- Enable RLS
ALTER TABLE meeting_transcriptions ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can view transcriptions for meetings they have access to
CREATE POLICY view_meeting_transcriptions ON meeting_transcriptions
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
      AND (
        m.created_by = auth.uid()
        OR m.department_id IN (
          SELECT department_id FROM users WHERE id = auth.uid()
        )
      )
    )
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
  );

-- RLS policy: Users can insert their own transcriptions
CREATE POLICY insert_meeting_transcriptions ON meeting_transcriptions
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
      AND (
        m.created_by = auth.uid()
        OR m.department_id IN (
          SELECT department_id FROM users WHERE id = auth.uid()
        )
        OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
      )
    )
  );

-- RLS policy: Users can update their own transcriptions
CREATE POLICY update_meeting_transcriptions ON meeting_transcriptions
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS policy: Users can delete their own transcriptions
CREATE POLICY delete_meeting_transcriptions ON meeting_transcriptions
  FOR DELETE
  USING (created_by = auth.uid());
