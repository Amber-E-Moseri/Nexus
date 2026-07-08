-- =============================================================================
-- DIAGNOSTIC: Users with NULL department_id
-- =============================================================================
-- Run this query to understand scope of P0 #1 (JWT hook NULL department_id issue)
-- Report back: count and role distribution

-- Query 1: Total count and role distribution
SELECT
  role,
  COUNT(*) as user_count,
  COUNT(*) FILTER (WHERE department_id IS NULL) as null_dept_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE department_id IS NULL) / COUNT(*), 1) as pct_null
FROM public.users
GROUP BY role
ORDER BY null_dept_count DESC, role;

-- Query 2: List all users with NULL department_id (for spot-checking)
SELECT
  id,
  name,
  email,
  role,
  department_id,
  created_at
FROM public.users
WHERE department_id IS NULL
ORDER BY role, created_at DESC;

-- Query 3: Count by role for users WITH a department (sanity check)
SELECT
  role,
  COUNT(*) as users_with_dept,
  COUNT(DISTINCT department_id) as distinct_departments
FROM public.users
WHERE department_id IS NOT NULL
GROUP BY role
ORDER BY users_with_dept DESC;
