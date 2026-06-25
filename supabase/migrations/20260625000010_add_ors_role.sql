-- Add 'ors' to the user_role enum (prerequisite for campus_edits RLS policies)
ALTER TYPE user_role ADD VALUE 'ors' BEFORE 'member';

-- Optionally assign ors role to existing users in ORS department
-- Uncomment to backfill, but be careful not to override super_admin
-- UPDATE users SET role = 'ors'
-- WHERE department_id = (SELECT id FROM departments WHERE name = 'ORS' LIMIT 1)
-- AND role != 'super_admin';
