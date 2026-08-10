-- Fix Tobi Ibiyeye's arrival date format
-- The date was submitted as "08/28/2026" but the database needs proper date format
UPDATE public.registrations
SET 
  arrival_date = '2026-08-28'::date
WHERE email = 'tobiibiyeye101@gmail.com';

-- Verify the update
SELECT email, full_name, arrival_date, arrival_time, arrival_flight, departure_date, departure_time, departure_flight
FROM public.registrations
WHERE email = 'tobiibiyeye101@gmail.com';
