-- ============================================================
-- Add group_member base role with sprint-scoped permissions
-- ============================================================
-- Group members have restricted access:
-- - No org-wide sprint visibility (controlled only by sprint_members join)
-- - Can join/request access to sprints
-- - Limited settings: profile, notifications, automations, integrations only
-- - No people management, platform access, or cross-department features

-- Update users.role CHECK constraint to include 'group_member'
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_role_check,
ADD CONSTRAINT users_role_check
  CHECK (role in ('super_admin', 'dept_lead', 'pastor', 'regional_secretary', 'member', 'group_member'));

-- Seed role_permissions for group_member
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('group_member', 'base', 'sprints:view',          true, true,  'View assigned sprints only (via sprint_members)', 'sprints'),
  ('group_member', 'base', 'sprints:join',          true, true,  'Request access to sprints',                      'sprints'),
  ('group_member', 'base', 'tasks:view',            true, true,  'View tasks in assigned sprints',                  'tasks'),
  ('group_member', 'base', 'tasks:create',          true, true,  'Create tasks in assigned sprints',                'tasks'),
  ('group_member', 'base', 'tasks:assign',          true, true,  'Assign tasks in assigned sprints',                'tasks'),
  ('group_member', 'base', 'profile:edit',          true, true,  'Edit own profile only',                           'profile'),
  ('group_member', 'base', 'notifications:manage',  true, true,  'Manage own notifications',                        'settings'),
  ('group_member', 'base', 'automations:manage',    true, true,  'Manage automations in assigned sprints',          'settings'),
  ('group_member', 'base', 'integrations:manage',   true, true,  'Manage integrations',                             'settings'),
  ('group_member', 'base', 'task_follows:create',   true, false, 'Follow tasks for notifications',                  'tasks'),
  -- Explicitly disable group_member from these permissions
  ('group_member', 'base', 'people:view',           false, false, 'NO people management',                            'people'),
  ('group_member', 'base', 'calendar:view',         false, false, 'NO calendar access',                              'calendar'),
  ('group_member', 'base', 'calendar:write',        false, false, 'NO calendar write',                               'calendar'),
  ('group_member', 'base', 'meetings:view',         false, false, 'NO meetings access',                              'meetings'),
  ('group_member', 'base', 'meetings:manage',       false, false, 'NO meetings management',                          'meetings'),
  ('group_member', 'base', 'spaces:create',         false, false, 'NO space creation',                               'spaces'),
  ('group_member', 'base', 'reports:view',          false, false, 'NO reports access',                               'admin'),
  ('group_member', 'base', 'users:manage',          false, false, 'NO user management',                              'admin'),
  ('group_member', 'base', 'api:access',            false, false, 'NO API access',                                   'admin'),
  ('group_member', 'base', 'flock_crm:full',        false, false, 'NO Flock CRM access',                             'flock'),
  ('group_member', 'base', 'my_flock:view_all',     false, false, 'NO flock view all',                               'flock'),
  ('group_member', 'base', 'my_flock:view',         false, false, 'NO flock view',                                   'flock'),
  ('group_member', 'base', 'my_flock:manage',       false, false, 'NO flock management',                             'flock')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
