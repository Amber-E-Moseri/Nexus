-- Add sync tracking columns to google_calendar_tokens
ALTER TABLE public.google_calendar_tokens
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS tasks_synced integer NOT NULL DEFAULT 0;
