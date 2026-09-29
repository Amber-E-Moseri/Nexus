-- Room assignments need each person's gender (rooms are colour-coded and mixed-gender assignments warn).
-- Working List participants had no gender, so Rooms could not draw from them. Store it on the canonical record.

ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IN ('male', 'female'));

COMMENT ON COLUMN public.icplc_participants.gender IS
  'Used for room assignment (male | female). Null = not recorded.';
