-- Lets admins hand-edit flight info in the Transportation tab without the
-- next Ministry Platform sync (manual or the pg_cron scheduled one) clobbering
-- the edit. Any inline edit sets this flag; registration-api-sync's flights
-- apply step skips rows where it's true. Clearing a flight resets it to false
-- so the row goes back to being sync-managed.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS flight_manual_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.registrations.flight_manual_override IS
  'True when arrival/departure flight fields were hand-edited in the Transportation tab; registration-api-sync skips overwriting flight fields for these rows until cleared.';
