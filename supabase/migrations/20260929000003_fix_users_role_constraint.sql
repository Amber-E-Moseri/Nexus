-- Fix users.role CHECK constraint to allow all valid roles
-- Backfills unknown roles to 'member' to prevent constraint violations

-- Backfill any unknown roles to 'member' before enforcing constraint
UPDATE users
SET role = 'member'
WHERE role NOT IN (
  'super_admin',
  'regional_secretary',
  'dept_lead',
  'pastor',
  'ors',
  'programs',
  'media',
  'member'
);

-- Verify the constraint is set correctly
-- If users.role_check doesn't exist, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_role_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN (
      'super_admin',
      'regional_secretary',
      'dept_lead',
      'pastor',
      'ors',
      'programs',
      'media',
      'member'
    ));
  END IF;
END $$;
