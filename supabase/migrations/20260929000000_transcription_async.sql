-- Async Deepgram transcription support
-- Adds job tracking columns, expands status enum, and enables realtime

ALTER TABLE public.meeting_transcriptions
  ADD COLUMN IF NOT EXISTS deepgram_job_id text,
  ADD COLUMN IF NOT EXISTS full_transcript text,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Expand status check to include async states
ALTER TABLE public.meeting_transcriptions
  DROP CONSTRAINT IF EXISTS meeting_transcriptions_status_check;

ALTER TABLE public.meeting_transcriptions
  ADD CONSTRAINT meeting_transcriptions_status_check
  CHECK (status IN ('processing', 'transcribing', 'complete', 'failed', 'error'));

-- Allow null summary for async records that haven't completed yet
ALTER TABLE public.meeting_transcriptions
  ALTER COLUMN summary DROP NOT NULL;

-- Enable realtime so the frontend can subscribe to status changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meeting_transcriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_transcriptions';
  END IF;
END $$;
