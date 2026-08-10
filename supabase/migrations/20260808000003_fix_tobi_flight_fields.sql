-- Fix all flight fields for Tobi Ibiyeye (email: tobiibiyeye101@gmail.com)
-- Arrival: 2026-08-28 at 14:25, Westjet flight 380
-- Departure: 2026-08-31 at 07:00, Westjet flight 483

UPDATE public.registrations
SET
  arrival_date     = '2026-08-28'::date,
  arrival_time     = '14:25:00'::time,
  arrival_flight   = 'Westjet flight 380',
  departure_date   = '2026-08-31'::date,
  departure_time   = '07:00:00'::time,
  departure_flight = 'Westjet flight 483'
WHERE email = 'tobiibiyeye101@gmail.com';

-- Verify
SELECT email, full_name, arrival_date, arrival_time, arrival_flight,
       departure_date, departure_time, departure_flight
FROM public.registrations
WHERE email = 'tobiibiyeye101@gmail.com';
