-- Ensure users table has correct schema and no subgroup column
-- This fixes the "Could not find the 'subgroup' column" error

-- Check if subgroup column exists and remove it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'subgroup'
  ) THEN
    ALTER TABLE public.users DROP COLUMN subgroup;
  END IF;
END $$;

-- Ensure all required columns exist
DO $$
BEGIN
  -- name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.users ADD COLUMN name TEXT;
  END IF;

  -- email column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.users ADD COLUMN email TEXT UNIQUE;
  END IF;

  -- role column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
      CHECK(role IN ('super_admin', 'dept_lead', 'pastor', 'member'));
  END IF;

  -- department_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'department_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN department_id UUID REFERENCES public.departments(id);
  END IF;
END $$;
