-- Add default_event_type to ministry_calendar_sources so admins can map each
-- Google calendar source to a Nexus event category.
-- Existing rows default to 'event', preserving current behavior until reconfigured.

ALTER TABLE public.ministry_calendar_sources
  ADD COLUMN IF NOT EXISTS default_event_type TEXT NOT NULL DEFAULT 'event';

-- Soft FK: validate the value exists in calendar_event_types at write time.
-- A hard FK would cascade on rename; a trigger gives a clear error without coupling.
CREATE OR REPLACE FUNCTION public.validate_source_event_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.calendar_event_types WHERE name = NEW.default_event_type
  ) THEN
    RAISE EXCEPTION 'Invalid default_event_type: %. Must match a calendar_event_types entry.', NEW.default_event_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_source_event_type ON public.ministry_calendar_sources;
CREATE TRIGGER trg_validate_source_event_type
  BEFORE INSERT OR UPDATE ON public.ministry_calendar_sources
  FOR EACH ROW EXECUTE FUNCTION public.validate_source_event_type();
