-- Correct Tobi Ibiyeye's flight data — previous migration applied wrong flights.
-- Actual Ministry Platform submission (Oluwatobiloba Ibiyeye):
-- Arrival: 2026-08-27 at 08:40, flight F8643
-- Departure: 2026-08-30 at 17:10, flight F8648

UPDATE public.registrations
SET
  arrival_date     = '2026-08-27'::date,
  arrival_time     = '08:40:00'::time,
  arrival_flight   = 'F8643',
  departure_date   = '2026-08-30'::date,
  departure_time   = '17:10:00'::time,
  departure_flight = 'F8648'
WHERE email = 'tobiibiyeye101@gmail.com';

-- Verify
SELECT email, full_name, arrival_date, arrival_time, arrival_flight,
       departure_date, departure_time, departure_flight
FROM public.registrations
WHERE email = 'tobiibiyeye101@gmail.com';
