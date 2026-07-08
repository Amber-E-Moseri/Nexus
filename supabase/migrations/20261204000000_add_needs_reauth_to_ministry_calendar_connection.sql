-- Fix: Add needs_reauth column to ministry_calendar_connection
-- Problem: No way to persist that the shared connection has failed reauth checks
-- Solution: Add boolean column to track reauth requirement for the shared OAuth token

ALTER TABLE public.ministry_calendar_connection
  ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT FALSE;
