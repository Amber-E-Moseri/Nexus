-- Add sprint management permission to dept_lead role.
-- Dept leads can now create and manage sprints within their spaces,
-- same as the programs space role.

INSERT INTO role_permissions (role, role_scope, permission_key, enabled, is_baseline, description, category)
VALUES ('dept_lead', 'space', 'sprints:manage', true, true, 'Create and manage sprints', 'sprints')
ON CONFLICT (role, role_scope, permission_key) DO UPDATE
SET enabled = true, updated_at = now();
