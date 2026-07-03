-- ============================================================
-- Add feature_roles and dept_roles columns for multi-role support
-- ============================================================

-- Add feature_roles column for space-scoped permissions
ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_roles JSONB DEFAULT '[]';

-- Structure: [{ "space_id": "uuid", "roles": ["ORS", "programs", "media"] }]
CREATE INDEX IF NOT EXISTS idx_users_feature_roles
ON users USING GIN (feature_roles);

-- Add dept_roles column for multi-dept leadership
ALTER TABLE users ADD COLUMN IF NOT EXISTS dept_roles JSONB DEFAULT '[]';

-- Structure: [{ "dept_id": "uuid", "role": "dept_lead" }]
CREATE INDEX IF NOT EXISTS idx_users_dept_roles
ON users USING GIN (dept_roles);

-- Verify columns added
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name IN ('feature_roles', 'dept_roles');
