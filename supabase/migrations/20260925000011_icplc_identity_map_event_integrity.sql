-- ICPLC-P8-001: Enforce event_id co-domain on icplc_identity_maps
--
-- Without this constraint the DB accepted a row where identity_map.event_id (EventB)
-- referenced a participant whose event_id was EventA, silently corrupting identity
-- resolution across events.
--
-- Fix: make (event_id, id) a composite unique key on icplc_participants (FK target),
-- then add a composite FK on icplc_identity_maps(event_id, participant_id) referencing
-- it.  This enforces identity_map.event_id = participant.event_id at the DB layer.
--
-- The existing scalar FK icplc_identity_maps_participant_id_fkey (participant_id → id)
-- is kept — it is now implied by the composite FK but does no harm.

-- Step 1: unique index on icplc_participants(event_id, id) to serve as FK target.
-- IF NOT EXISTS guards against re-run on an already-patched DB.
CREATE UNIQUE INDEX IF NOT EXISTS icplc_participants_event_id_idx
  ON public.icplc_participants (event_id, id);

-- Step 2: composite FK — enforces identity_map.event_id = participant.event_id.
-- ON DELETE CASCADE mirrors the existing scalar FK so removing a participant
-- still removes its identity maps.
ALTER TABLE public.icplc_identity_maps
  ADD CONSTRAINT icplc_identity_maps_event_participant_fk
  FOREIGN KEY (event_id, participant_id)
  REFERENCES public.icplc_participants (event_id, id)
  ON DELETE CASCADE;
