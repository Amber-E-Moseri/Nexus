-- Set arrival date for Nigel Dara and Natasha Dara (Aug 28 2026)
-- Arrival time/flight were set in 20260822000001; no departure info yet.

UPDATE registrations
SET arrival_date = '2026-08-28'
WHERE LOWER(full_name) LIKE '%nigel dara%'
   OR LOWER(full_name) LIKE '%natasha dara%';
