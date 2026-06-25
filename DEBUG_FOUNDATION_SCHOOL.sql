-- Debug script to check Foundation School integration visibility
-- Run this in Supabase SQL editor to see what's happening

-- 1. Check if Foundation School exists in the database
SELECT
  id,
  name,
  type,
  enabled,
  visible_to,
  department_id,
  department_ids,
  user_id,
  user_ids,
  created_at
FROM public.external_integrations
WHERE name = 'Foundation School'
LIMIT 1;

-- 2. Check all integrations (as super_admin you should see all)
SELECT
  id,
  name,
  enabled,
  visible_to,
  department_id,
  array_length(coalesce(department_ids, array[]::uuid[]), 1) as dept_count,
  user_id,
  array_length(coalesce(user_ids, array[]::uuid[]), 1) as user_count
FROM public.external_integrations
ORDER BY sort_order;

-- 3. Check RLS policy evaluation for current user
-- This simulates what the RLS policy checks
SELECT
  id,
  name,
  enabled,
  visible_to,
  public.current_user_role() as current_role,
  public.current_user_department() as current_dept,
  auth.uid() as current_user_id,
  (enabled = true) as enabled_check,
  (public.current_user_role() = 'super_admin') as is_super_admin,
  (
    department_id is null
    and (department_ids is null or array_length(department_ids, 1) is null)
    and user_id is null
    and (user_ids is null or array_length(user_ids, 1) is null)
  ) as is_global,
  (visible_to = 'all' or visible_to = public.current_user_role()) as visible_to_match
FROM public.external_integrations
WHERE name = 'Foundation School'
LIMIT 1;

-- 4. If Foundation School doesn't exist, check all seed data
SELECT COUNT(*) as integration_count FROM public.external_integrations;
