-- Mark Ivana Moseri (BLW York University, Central Subgroup A) as absent
UPDATE working_list
SET absent = true
WHERE LOWER(full_name) LIKE '%ivana moseri%';
