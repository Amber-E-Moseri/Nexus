-- Grant moseriamber@gmail.com dept_lead role in Programs space
-- Ensures she has space-scoped dept_lead access for sprint/calendar management

INSERT INTO public.space_roles (user_id, space_id, role, granted_by, created_at)
SELECT
  u.id,
  d.id,
  'dept_lead',
  u.id,
  now()
FROM public.users u
JOIN public.departments d ON d.name = 'Programs' AND d.space_type = 'department'
WHERE u.email = 'moseriamber@gmail.com'
ON CONFLICT (user_id, space_id, role) DO NOTHING;
