-- Grant dept_lead full management permissions across sprints, calendar,
-- communications, and meetings to match Programs team capabilities.

INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('dept_lead', 'space', 'communications:create', true, true, 'Create broadcast campaigns', 'communications'),
  ('dept_lead', 'space', 'communications:send',   true, true, 'Send broadcast campaigns', 'communications'),
  ('dept_lead', 'space', 'meetings:manage',       true, true, 'Create, manage, and run minutes for meetings', 'meetings'),
  ('dept_lead', 'space', 'meetings:record',       true, true, 'Record meeting audio', 'meetings'),
  ('dept_lead', 'space', 'calendar:create',       true, true, 'Create/edit ministry calendar events', 'calendar'),
  ('dept_lead', 'space', 'calendar:tags',         true, true, 'Create tags and assign visibility', 'calendar')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = true, updated_at = now();
