-- Phase 0: Add Zoom recording fields to meetings table
-- Supports recording metadata tracking and status workflow

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS zoom_recording_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS recording_download_url text,
  ADD COLUMN IF NOT EXISTS recording_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS recording_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS recording_transcription_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_sync_status text DEFAULT 'pending' CHECK (recording_sync_status IN ('pending', 'downloading', 'downloaded', 'transcribing', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS recording_sync_error text;

-- Index for efficient job queries (find meetings ready for sync/intelligence generation)
CREATE INDEX IF NOT EXISTS idx_meetings_recording_sync_status ON public.meetings(department_id, recording_sync_status, created_at) WHERE recording_sync_status != 'complete';
