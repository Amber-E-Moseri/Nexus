-- ============================================================
-- CRITICAL: Update users.role CHECK constraint to support all 8 roles
-- Previously only allowed: super_admin, dept_lead, pastor, member
-- Now also allows: regional_secretary, ors, programs, media
-- ============================================================

-- Step 1: Drop the old CHECK constraint
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_role_check;

-- Step 2: Add new CHECK constraint with all 8 roles
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

-- Step 3: Update any 'reg_sec' values to 'regional_secretary' (if any exist)
UPDATE users
SET role = 'regional_secretary'
WHERE role = 'reg_sec';

-- Step 4: Verify the update
-- SELECT COUNT(*) as total_users, role FROM users GROUP BY role ORDER BY role;
