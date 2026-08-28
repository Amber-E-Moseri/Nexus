ALTER TABLE this_is_it_event_content
  ADD COLUMN IF NOT EXISTS hospitality_contact_1_name  text,
  ADD COLUMN IF NOT EXISTS hospitality_contact_1_phone text,
  ADD COLUMN IF NOT EXISTS hospitality_contact_2_name  text,
  ADD COLUMN IF NOT EXISTS hospitality_contact_2_phone text;
