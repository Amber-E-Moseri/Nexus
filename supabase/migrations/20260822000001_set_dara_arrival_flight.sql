-- Set arrival flight for Nigel Dara and Natasha Dara
-- Arrival: 8:40 AM, flight F8G43
-- flight_manual_override = true so the next sheet sync won't overwrite these values

UPDATE registrations
SET
  arrival_time           = '08:40',
  arrival_flight         = 'F8G43',
  flight_manual_override = true
WHERE LOWER(full_name) LIKE '%nigel dara%'
   OR LOWER(full_name) LIKE '%natasha dara%';
