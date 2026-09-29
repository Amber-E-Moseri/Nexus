-- Update service_center_schedule with new host names for Sunday Gatherings
-- Add 'SundayGathering' to service_kind CHECK constraint

-- ─── 1. Update service_kind CHECK constraint to allow 'SundayGathering' ──────
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.service_reports'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%service_kind%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.service_reports DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.service_reports
    ADD CONSTRAINT service_kind_check CHECK (service_kind IN ('SundayService', 'SundayGathering', 'GlobalService'));
END;
$$;

-- ─── 2. Update church names in service_center_schedule ──────────────────────
UPDATE public.service_center_schedule SET church_name = 'BLW Niagara Church'          WHERE church_unit_id = 'cmphy72jl00gvoaqnwxbl323m';
UPDATE public.service_center_schedule SET church_name = 'BLW Edmonton Church'         WHERE church_unit_id = 'cmowttfk1006ih4nrsiiodc0k';
UPDATE public.service_center_schedule SET church_name = 'CESGB City Church'           WHERE church_unit_id = 'cmowttfj0001sh4nrfx1pcdz9';
UPDATE public.service_center_schedule SET church_name = 'BLW Calgary Church'          WHERE church_unit_id = 'cmowttfio000wh4nrxflfawch';
UPDATE public.service_center_schedule SET church_name = 'Central East City Church'    WHERE church_unit_id = 'cmowttfix001kh4nrf2pq7a5o';
UPDATE public.service_center_schedule SET church_name = 'BLW Downtown Winnipeg Church' WHERE church_unit_id = 'cmowttfk90075h4nr5b8zbdxx';
UPDATE public.service_center_schedule SET church_name = 'Lethbridge City Church'      WHERE church_unit_id = 'cmowttfis0016h4nr12f17l3l';
UPDATE public.service_center_schedule SET church_name = 'BLW Regina Church'           WHERE church_unit_id = 'cmowttfiu001dh4nrf5tcysl9';
UPDATE public.service_center_schedule SET church_name = 'BLW Mississauga Church'       WHERE church_unit_id = 'cmowttfkx009hh4nrflap990z';
UPDATE public.service_center_schedule SET church_name = 'BLW Scarborough Church'       WHERE church_unit_id = 'cmowttfqw00t1h4nrv9ihyejy';
UPDATE public.service_center_schedule SET church_name = 'BLW York Church'             WHERE church_unit_id = 'cmowttfj2001wh4nrm1xgermy';

-- ─── 3. Populate host_name_history with old → new mappings ────────────────
INSERT INTO public.host_name_history (church_unit_id, old_host_name, new_host_name, notes) VALUES
  ('cmphy72jl00gvoaqnwxbl323m', 'Brock Service Center', 'BLW Niagara Church', 'Service type changed to SundayGathering'),
  ('cmowttfk1006ih4nrsiiodc0k', 'Edmonton Service Center', 'BLW Edmonton Church', 'Service type changed to SundayGathering'),
  ('cmowttfj0001sh4nrfx1pcdz9', 'MUN Service Center', 'CESGB City Church', 'Service type changed to SundayGathering'),
  ('cmowttfio000wh4nrxflfawch', 'UCalgary Service Center', 'BLW Calgary Church', 'Service type changed to SundayGathering'),
  ('cmowttfix001kh4nrf2pq7a5o', 'UManitoba Service Center', 'Central East City Church', 'Service type changed to SundayGathering'),
  ('cmowttfk90075h4nr5b8zbdxx', 'UWinnipeg Service Center', 'BLW Downtown Winnipeg Church', 'Service type changed to SundayGathering'),
  ('cmowttfis0016h4nr12f17l3l', 'UofL Service Center', 'Lethbridge City Church', 'Service type changed to SundayGathering'),
  ('cmowttfiu001dh4nrf5tcysl9', 'URegina Service Center', 'BLW Regina Church', 'Service type changed to SundayGathering'),
  ('cmowttfkx009hh4nrflap990z', 'UTM Service Center', 'BLW Mississauga Church', 'Service type changed to SundayGathering'),
  ('cmowttfqw00t1h4nrv9ihyejy', 'UTSC Service Center', 'BLW Scarborough Church', 'Service type changed to SundayGathering'),
  ('cmowttfj2001wh4nrm1xgermy', 'YorkU Service Center', 'BLW York Church', 'Service type changed to SundayGathering')
ON CONFLICT DO NOTHING;
