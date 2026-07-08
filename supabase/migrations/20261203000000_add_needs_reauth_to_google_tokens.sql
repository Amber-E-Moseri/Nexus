-- Fix: Add needs_reauth column to google_calendar_tokens
-- Problem: No way to persist that a token has failed reauth checks
-- Solution: Add boolean column to track reauth requirement

ALTER TABLE public.google_calendar_tokens
  ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS google_calendar_tokens_needs_reauth_idx
  ON public.google_calendar_tokens(needs_reauth)
  WHERE needs_reauth = true;
