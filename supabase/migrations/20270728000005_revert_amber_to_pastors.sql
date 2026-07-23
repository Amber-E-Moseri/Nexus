-- Revert blwcan.elvanto@gmail.com back to Pastors department
-- Remove dept_lead role in Programs

-- Update her department back to Pastors
UPDATE public.users
SET department_id = (SELECT id FROM public.departments WHERE name = 'Pastors' AND space_type = 'department' LIMIT 1)
WHERE email = 'blwcan.elvanto@gmail.com';

-- Remove her dept_lead role in Programs
DELETE FROM public.space_roles
WHERE user_id = (SELECT id FROM public.users WHERE email = 'blwcan.elvanto@gmail.com')
  AND space_id = (SELECT id FROM public.departments WHERE name = 'Programs' AND space_type = 'department')
  AND role = 'dept_lead';
