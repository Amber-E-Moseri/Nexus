-- Rename UGuelph Service Center → BLW Guelph Church to match naming convention
-- (missed in 20270927000001_growth_tracking_rename_centers.sql)

UPDATE public.service_center_schedule
  SET church_name = 'BLW Guelph Church'
  WHERE church_unit_id = 'cmowttftp013ph4nr90qvurvi';

INSERT INTO public.host_name_history (church_unit_id, old_host_name, new_host_name, notes)
VALUES ('cmowttftp013ph4nr90qvurvi', 'UGuelph Service Center', 'BLW Guelph Church', 'Renamed to match BLW naming convention; missed in previous rename migration')
ON CONFLICT DO NOTHING;
