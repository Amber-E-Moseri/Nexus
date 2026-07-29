-- Add sequence tracking for multi-audio support
ALTER TABLE meeting_transcriptions ADD COLUMN sequence_number INTEGER DEFAULT 0;
CREATE INDEX idx_meeting_transcriptions_sequence ON meeting_transcriptions(meeting_id, sequence_number);

-- Update constraint to allow multiple transcriptions per meeting
-- The old constraint was implicit (one summary per meeting via meetings.summary)
-- Now we explicitly support multiple with sequence ordering
