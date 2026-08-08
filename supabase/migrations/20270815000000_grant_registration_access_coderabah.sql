-- Migration: Grant registration access to blwmun.coderabah@gmail.com
-- Purpose: Add user to This Is It 2.0 Registration sprint team and assign to Central East Subgroup B
-- User should have full registration access (all tabs) except finance
-- Date: 2025-08-15

-- 1. Get the This Is It 2.0 sprint ID and Registration team
-- 2. Add user to the Registration team
-- 3. Assign user to "Central East Subgroup B" subgroup

WITH tii2_sprint AS (
  SELECT id FROM public.sprints WHERE name ILIKE '%This Is It 2.0%' LIMIT 1
),
reg_team AS (
  SELECT id FROM public.sprint_teams
  WHERE sprint_id = (SELECT id FROM tii2_sprint)
    AND name = 'Registration'
),
user_to_grant AS (
  SELECT id FROM public.users WHERE email ILIKE 'blwmun.coderabah@gmail.com'
)
-- Add user to Registration sprint team (if not already a member)
INSERT INTO public.sprint_team_members (sprint_id, team_id, user_id)
SELECT
  (SELECT id FROM tii2_sprint),
  (SELECT id FROM reg_team),
  (SELECT id FROM user_to_grant)
ON CONFLICT DO NOTHING;

-- Assign user to Central East Subgroup B for registration data scope
INSERT INTO public.pastor_subgroup_assignments (user_id, subgroup, status)
SELECT
  id,
  'Central East Subgroup B',
  'active'
FROM public.users
WHERE email ILIKE 'blwmun.coderabah@gmail.com'
ON CONFLICT (user_id, subgroup) DO UPDATE SET status = 'active';
