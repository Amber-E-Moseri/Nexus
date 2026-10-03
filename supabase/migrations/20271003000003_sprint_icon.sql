-- Add a per-sprint icon emoji field.
-- Nullable; SprintCard falls back to category default (✈️/👥) then ⚡.
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS icon text;
