-- ============================================================
-- PHASE 3 (5/5) — role_permissions seed (base + space scoped)
-- ============================================================
-- Supersedes supabase/seed_role_permissions.sql (deleted alongside this
-- migration — see below). That file predated role_scope and modeled
-- dept_lead as a base-role permission carrier; this seed corrects both.
--
-- Two changes from the earlier draft, per Amber's explicit approval:
--
--   1. dept_lead permissions move from role_scope='base' to
--      role_scope='space' (unique key: role='dept_lead',
--      role_scope='space'). Per the locked design, users.role='dept_lead'
--      alone grants nothing — authority comes only from holding a
--      space_roles row. super_admin, pastor, regional_secretary, and
--      member remain role_scope='base'.
--
--   2. meetings:manage / meetings:create drift resolved toward
--      meetings:manage as the superset (create+manage+minutes);
--      meetings:create is dropped as a separate key.
--        - ors: already had both; meetings:create removed as redundant.
--        - programs: had only meetings:create; replaced with
--          meetings:manage so programs users stop failing
--          meetings:manage gates (agendas Step 1/3, minutes capture —
--          see PHASE3_AUDIT.md finding on this drift).
--      meetings:view is untouched — it remains the separate, lesser
--      "can see meetings" capability for roles that shouldn't manage
--      them (pastor, member, regional_secretary).
--
-- Idempotent: every row upserts on (role, role_scope, permission_key).
-- ============================================================

-- ─── BASE ROLES (role_scope='base') ─────────────────────────

-- super_admin (also short-circuits to TRUE in userHasPermission() —
-- these rows exist so the Phase 6 admin matrix UI has something to
-- render, not because they gate access for this role).
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('super_admin', 'base', 'campus:approve',     true, true, 'Approve/reject campus edits', 'campus'),
  ('super_admin', 'base', 'campus:edit',        true, true, 'Submit campus edits',         'campus'),
  ('super_admin', 'base', 'meetings:manage',    true, true, 'Create, manage, and run minutes for meetings', 'meetings'),
  ('super_admin', 'base', 'meetings:view',      true, true, 'View all meetings',           'meetings'),
  ('super_admin', 'base', 'calendar:write',     true, true, 'Edit calendar',               'calendar'),
  ('super_admin', 'base', 'calendar:view',      true, true, 'View calendar',               'calendar'),
  ('super_admin', 'base', 'tasks:assign',       true, true, 'Assign tasks',                'tasks'),
  ('super_admin', 'base', 'reports:view',       true, true, 'View reports',                'admin'),
  ('super_admin', 'base', 'users:manage',       true, true, 'Manage users',                'admin'),
  ('super_admin', 'base', 'automations:manage', true, true, 'Manage automations',          'admin'),
  ('super_admin', 'base', 'api:access',         true, true, 'API access',                  'admin'),
  ('super_admin', 'base', 'flock_crm:full',     true, true, 'Full Flock CRM access',        'flock'),
  ('super_admin', 'base', 'my_flock:view_all',  true, true, 'View all My Flock data',       'flock')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- pastor
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('pastor', 'base', 'calendar:view',       true, true, 'View calendar',                    'calendar'),
  ('pastor', 'base', 'tasks:assign',        true, true, 'Assign tasks to flock members',    'tasks'),
  ('pastor', 'base', 'tasks:create',        true, true, 'Create tasks in own spaces',       'tasks'),
  ('pastor', 'base', 'meetings:view',       true, true, 'View meetings',                    'meetings'),
  ('pastor', 'base', 'spaces:create',       true, true, 'Create spaces for their flock',    'spaces'),
  ('pastor', 'base', 'my_flock:view',       true, true, 'View own flock members tasks',     'flock'),
  ('pastor', 'base', 'my_flock:manage',     true, true, 'Manage own flock assignments',     'flock'),
  ('pastor', 'base', 'task_follows:create', true, true, 'Follow tasks for notifications',   'tasks')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- regional_secretary (org-wide oversight role, deliberately not
-- space-scoped — locked design decision)
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('regional_secretary', 'base', 'flock_crm:full',      true,  true, 'Full Flock CRM access',          'flock'),
  ('regional_secretary', 'base', 'my_flock:view_all',   true,  true, 'View all pastors flock members', 'flock'),
  ('regional_secretary', 'base', 'spaces:view_all',     true,  true, 'View all spaces',                'spaces'),
  ('regional_secretary', 'base', 'meetings:view',       true,  true, 'View all meetings',              'meetings'),
  ('regional_secretary', 'base', 'people:view_all',     true,  true, 'View all users all depts',       'people'),
  -- instagram:grade is inert while Instagram Grading is paused (feature flag off, see src/config/features.js)
  ('regional_secretary', 'base', 'instagram:grade',     true,  true, 'Grade Instagram posts',          'instagram'),
  ('regional_secretary', 'base', 'api:access',          false, true, 'NO API access',                  'admin'),
  ('regional_secretary', 'base', 'integrations:manage', false, true, 'NO integrations',                'admin'),
  ('regional_secretary', 'base', 'automations:manage',  false, true, 'NO automations',                 'admin')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- member
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('member', 'base', 'calendar:view',       true, true,  'View own calendar',              'calendar'),
  ('member', 'base', 'tasks:view',          true, true,  'View own tasks',                 'tasks'),
  ('member', 'base', 'meetings:join',       true, true,  'Join meetings',                  'meetings'),
  ('member', 'base', 'spaces:create',       true, false, 'Create spaces (toggleable)',     'spaces'),
  ('member', 'base', 'folders:create',      true, false, 'Create folders (toggleable)',    'spaces'),
  ('member', 'base', 'lists:create',        true, false, 'Create lists (toggleable)',      'spaces'),
  ('member', 'base', 'task_follows:create', true, false, 'Follow tasks for notifications', 'tasks')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- ─── SPACE ROLES (role_scope='space') ───────────────────────
-- Granted per-space via space_roles; permissions here apply only
-- within the space where the user holds the role (once RLS is swapped
-- to call has_space_role() — see PHASE3_AUDIT.md §7.4 for sequencing).

-- ors
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('ors', 'space', 'campus:approve',        true,  true,  'Approve/reject campus edits',       'campus'),
  ('ors', 'space', 'campus:edit',           true,  true,  'Submit campus edits',               'campus'),
  ('ors', 'space', 'meetings:manage',       true,  true,  'Create, manage, and run minutes for meetings across all depts', 'meetings'),
  ('ors', 'space', 'meetings:view',         true,  true,  'View all meetings',                 'meetings'),
  ('ors', 'space', 'meetings:comment',      true,  true,  'Comment on all meetings',            'meetings'),
  ('ors', 'space', 'calendar:view',         true,  true,  'View calendar',                      'calendar'),
  ('ors', 'space', 'calendar:view_all',     true,  true,  'View all calendar tags (no filtering)', 'calendar'),
  ('ors', 'space', 'communications:create', true,  true,  'Create broadcast campaigns',         'communications'),
  ('ors', 'space', 'communications:view',   true,  true,  'View all campaigns',                 'communications'),
  ('ors', 'space', 'communications:send',   true,  true,  'Send broadcast campaigns',           'communications'),
  ('ors', 'space', 'reports:view',          true,  true,  'View reports',                       'admin'),
  ('ors', 'space', 'people:view',           true,  true,  'View all users',                     'people'),
  ('ors', 'space', 'users:manage',          false, false, 'Manage users (special)',             'admin')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- media
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('media', 'space', 'spaces:view',          true, true, 'View assigned spaces',            'spaces'),
  ('media', 'space', 'spaces:manage_own',    true, true, 'Manage media ops space',          'spaces'),
  ('media', 'space', 'tasks:create',         true, true, 'Create tasks in media space',     'tasks'),
  -- instagram:grade is inert while Instagram Grading is paused (feature flag off)
  ('media', 'space', 'instagram:grade',      true, true, 'Grade Instagram posts',           'instagram'),
  ('media', 'space', 'task_follows:create',  true, true, 'Follow tasks for notifications',  'tasks')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- programs
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('programs', 'space', 'calendar:create',       true, true, 'Create/edit ministry calendar events', 'calendar'),
  ('programs', 'space', 'calendar:tags',         true, true, 'Create tags and assign visibility',    'calendar'),
  ('programs', 'space', 'meetings:manage',       true, true, 'Create, manage, and run minutes for meetings', 'meetings'),
  ('programs', 'space', 'meetings:record',       true, true, 'Record meeting audio',                 'meetings'),
  ('programs', 'space', 'communications:create', true, true, 'Create broadcast campaigns',           'communications'),
  ('programs', 'space', 'communications:send',   true, true, 'Send broadcast campaigns',             'communications'),
  ('programs', 'space', 'sprints:manage',        true, true, 'Create and manage sprints',            'sprints'),
  ('programs', 'space', 'task_follows:create',   true, true, 'Follow tasks for notifications',       'tasks')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- dept_lead (moved from role_scope='base' — see file header)
INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category) VALUES
  ('dept_lead', 'space', 'calendar:write',     true,  true,  'Edit calendar',          'calendar'),
  ('dept_lead', 'space', 'calendar:view',      true,  true,  'View calendar',          'calendar'),
  ('dept_lead', 'space', 'tasks:assign',       true,  true,  'Assign tasks',           'tasks'),
  ('dept_lead', 'space', 'reports:view',       true,  true,  'View reports',           'admin'),
  ('dept_lead', 'space', 'automations:manage', true,  true,  'Manage automations',     'admin'),
  ('dept_lead', 'space', 'users:manage',       false, false, 'Manage users (special)', 'admin')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- Verify:
--   SELECT role, role_scope, count(*) FROM role_permissions GROUP BY role, role_scope ORDER BY role_scope, role;
