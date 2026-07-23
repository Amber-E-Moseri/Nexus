-- Move moseriamber from Pastors to Programs as dept_lead
-- Preserves pastor base role to maintain her current permissions

-- Update her department to Programs
UPDATE public.users
SET department_id = (SELECT id FROM public.departments WHERE name = 'Programs' AND space_type = 'department' LIMIT 1)
WHERE email = 'blwcan.elvanto@gmail.com';

-- Grant her dept_lead role in Programs space
INSERT INTO public.space_roles (user_id, space_id, role, granted_by, created_at)
SELECT
  u.id,
  d.id,
  'dept_lead',
  (SELECT id FROM public.users WHERE email = 'blwcan.elvanto@gmail.com' LIMIT 1),
  now()
FROM public.users u
JOIN public.departments d ON d.name = 'Programs' AND d.space_type = 'department'
WHERE u.email = 'blwcan.elvanto@gmail.com'
ON CONFLICT (user_id, space_id, role) DO NOTHING;
