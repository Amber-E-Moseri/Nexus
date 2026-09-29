-- Add 'ors' to the user_role enum (prerequisite for campus_edits RLS policies)
-- GUARD: No user_role enum type exists; users.role uses CHECK constraint.
-- Role expansion handled by 20261001000000 (CHECK) and 20261215000002 (space_roles).
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role' AND typnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ors' BEFORE 'member'$stmt$;
  END IF;
END;
$guard$;

-- Optionally assign ors role to existing users in ORS department
-- Uncomment to backfill, but be careful not to override super_admin
-- UPDATE users SET role = 'ors'
-- WHERE department_id = (SELECT id FROM departments WHERE name = 'ORS' LIMIT 1)
-- AND role != 'super_admin';
