-- Persist the "driving / in-state" flag to the DB so all users see the same
-- confirmed count, not just the device that set it via the Transportation tab.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS in_state boolean NOT NULL DEFAULT false;
