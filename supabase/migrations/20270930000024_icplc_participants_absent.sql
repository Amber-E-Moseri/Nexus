-- Staff-marked absence. Distinct from registration: an unregistered person is just unregistered;
-- only someone explicitly marked absent is shown struck through on the Working List.
-- Not an import-mutable field, so re-imports never touch it.

ALTER TABLE public.icplc_participants
  ADD COLUMN IF NOT EXISTS absent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.icplc_participants.absent IS
  'True when staff marked this participant absent. Drives the strikethrough in the Working List.';
