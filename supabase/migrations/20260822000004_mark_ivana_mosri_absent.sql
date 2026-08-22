-- Mark Ivana Mosri as absent in the working list
UPDATE working_list
SET absent = true
WHERE LOWER(full_name) LIKE '%ivana mosri%';
