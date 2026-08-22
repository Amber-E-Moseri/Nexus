-- Mark Ivana Moseri absent by her registration email
UPDATE working_list
SET absent = true
WHERE email = 'moseriamber@gmail.com';
