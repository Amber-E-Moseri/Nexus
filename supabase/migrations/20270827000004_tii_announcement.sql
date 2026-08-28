ALTER TABLE this_is_it_event_content
  ADD COLUMN IF NOT EXISTS announcement_text    text,
  ADD COLUMN IF NOT EXISTS announcement_active  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS airport_oop_note     text;
