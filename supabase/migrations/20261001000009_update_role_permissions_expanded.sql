-- ============================================================
-- Update role_permissions seeds for expanded 8-role system
-- Replaces 'reg_sec' with 'regional_secretary' and adds new roles
-- ============================================================

-- Clean up old 'reg_sec' entries (migrate to 'regional_secretary')
DELETE FROM role_permissions WHERE role = 'reg_sec';

-- ORS permissions (update existing rows)
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('ors', 'meetings:create', true, true, 'Create meetings across all depts', 'meetings'),
('ors', 'meetings:view', true, true, 'View all meetings', 'meetings'),
('ors', 'meetings:comment', true, true, 'Comment on all meetings', 'meetings'),
('ors', 'communications:create', true, true, 'Create broadcast campaigns', 'communications'),
('ors', 'communications:view', true, true, 'View all campaigns', 'communications'),
('ors', 'communications:send', true, true, 'Send broadcast campaigns', 'communications'),
('ors', 'calendar:view_all', true, true, 'View all ministry calendar tags (no filtering)', 'calendar'),
('ors', 'campus:approve', true, true, 'Approve campus edits', 'campus'),
('ors', 'people:view', true, true, 'View all users', 'people')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- PASTOR permissions
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('pastor', 'spaces:create', true, true, 'Create spaces for their flock', 'spaces'),
('pastor', 'my_flock:view', true, true, 'View own flock members tasks', 'flock'),
('pastor', 'my_flock:manage', true, true, 'Manage own flock pastoral assignments', 'flock'),
('pastor', 'tasks:create', true, true, 'Create tasks in own spaces', 'tasks'),
('pastor', 'tasks:assign', true, true, 'Assign tasks to flock members', 'tasks'),
('pastor', 'task_follows:create', true, true, 'Follow tasks for notifications', 'tasks')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- REGIONAL_SECRETARY permissions
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('regional_secretary', 'flock_crm:full', true, true, 'Full Flock CRM access', 'flock'),
('regional_secretary', 'my_flock:view_all', true, true, 'View all pastors flock members', 'flock'),
('regional_secretary', 'spaces:view_all', true, true, 'View all spaces', 'spaces'),
('regional_secretary', 'meetings:view', true, true, 'View all meetings', 'meetings'),
('regional_secretary', 'people:view_all', true, true, 'View all users all depts', 'people'),
('regional_secretary', 'instagram:grade', true, true, 'Grade Instagram posts', 'instagram'),
('regional_secretary', 'api:access', false, true, 'NO API access', 'admin'),
('regional_secretary', 'integrations:manage', false, true, 'NO integrations', 'admin'),
('regional_secretary', 'automations:manage', false, true, 'NO automations', 'admin')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- MEMBER permissions (open creation model)
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('member', 'spaces:create', true, false, 'Create spaces (toggleable by admin)', 'spaces'),
('member', 'folders:create', true, false, 'Create folders (toggleable)', 'spaces'),
('member', 'lists:create', true, false, 'Create lists (toggleable)', 'spaces'),
('member', 'task_follows:create', true, false, 'Follow tasks for notifications', 'tasks')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- MEDIA permissions
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('media', 'spaces:view', true, true, 'View assigned spaces', 'spaces'),
('media', 'spaces:manage_own', true, true, 'Manage media ops space', 'spaces'),
('media', 'tasks:create', true, true, 'Create tasks in media space', 'tasks'),
('media', 'instagram:grade', true, true, 'Grade Instagram posts', 'instagram'),
('media', 'task_follows:create', true, true, 'Follow tasks for notifications', 'tasks')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- PROGRAMS permissions (feature role, space-scoped)
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('programs', 'calendar:create', true, true, 'Create and edit ministry calendar events', 'calendar'),
('programs', 'calendar:tags', true, true, 'Create tags and assign visibility', 'calendar'),
('programs', 'meetings:create', true, true, 'Create and manage meetings', 'meetings'),
('programs', 'meetings:record', true, true, 'Record meeting audio', 'meetings'),
('programs', 'communications:create', true, true, 'Create broadcast campaigns', 'communications'),
('programs', 'communications:send', true, true, 'Send broadcast campaigns', 'communications'),
('programs', 'sprints:manage', true, true, 'Create and manage sprints', 'sprints'),
('programs', 'task_follows:create', true, true, 'Follow tasks for notifications', 'tasks')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- SUPER_ADMIN: Add Flock + My Flock (permanent — IK will manage access manually)
INSERT INTO role_permissions (role, permission_key, enabled, is_baseline, description, category) VALUES
('super_admin', 'flock_crm:full', true, true, 'Full Flock CRM access (note: was added for testing, IK to review)', 'flock'),
('super_admin', 'my_flock:view_all', true, true, 'View all My Flock pastoral data (note: was added for testing)', 'flock')
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- Verify all roles have permissions
-- SELECT role, COUNT(*) as permission_count FROM role_permissions GROUP BY role ORDER BY role;
