-- Ivana Moseri has no working_list row, so UPDATE migrations matched 0 rows.
-- Insert her directly as absent so she's excluded from confirming counts.
INSERT INTO working_list (full_name, email, fellowship, subgroup, absent, manually_added, synced_at)
SELECT
  r.full_name,
  r.email,
  r.fellowship,
  r.subgroup,
  true AS absent,
  true AS manually_added,
  NOW() AS synced_at
FROM registrations r
WHERE r.email = 'moseriamber@gmail.com'
ON CONFLICT (email) DO UPDATE SET absent = true;
