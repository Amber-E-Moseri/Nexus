-- Mark Ivana Moseri absent — targeted by phone number to avoid name-match issues
UPDATE working_list
SET absent = true
WHERE phone_number = '+16475814338'
   OR LOWER(full_name) LIKE '%ivana moseri%';
