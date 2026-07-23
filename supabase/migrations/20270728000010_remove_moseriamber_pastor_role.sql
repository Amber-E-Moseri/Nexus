-- Change moseriamber@gmail.com base role from pastor to member
-- She now manages Programs only via dept_lead space role, not pastor base role

UPDATE public.users
SET role = 'member'
WHERE email = 'moseriamber@gmail.com'
  AND role = 'pastor';
