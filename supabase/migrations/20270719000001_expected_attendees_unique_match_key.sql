-- Prevent silent duplicate-name matches in absentee resolution.
-- Will error if duplicate active match_keys exist — resolve those manually first.
CREATE UNIQUE INDEX IF NOT EXISTS expected_attendees_match_key_unique
  ON public.expected_attendees(match_key)
  WHERE active = true;
