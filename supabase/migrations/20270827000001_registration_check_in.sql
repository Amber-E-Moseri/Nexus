-- Add check-in timestamp to registrations for event-day attendance tracking.
-- Null = not yet checked in. Populated when staff marks someone as arrived.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
