-- Add prayer & fasting editable fields to this_is_it_event_content
ALTER TABLE this_is_it_event_content
  ADD COLUMN IF NOT EXISTS prayer_p1 text,
  ADD COLUMN IF NOT EXISTS prayer_p2 text;
