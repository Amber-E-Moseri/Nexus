-- Grant natasha.dara@ymail.com dept_lead role in the Media space
-- Additive only: her base users.role and department_id stay on Pastors, so
-- she keeps her existing Pastors station/functionality. This space_roles
-- grant (see 20270728000009 for the same pattern) layers department-head
-- access to Media on top, without moving her primary department.

INSERT INTO public.space_roles (user_id, space_id, role, granted_by, created_at)
SELECT
  u.id,
  d.id,
  'dept_lead',
  u.id,
  now()
FROM public.users u
JOIN public.departments d ON d.name = 'Media' AND d.space_type = 'department'
WHERE lower(u.email) = lower('natasha.dara@ymail.com')
ON CONFLICT (user_id, space_id, role) DO NOTHING;
