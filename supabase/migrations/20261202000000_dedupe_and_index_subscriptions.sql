-- Fix: Deduplicate and add unique index for 'all' scope subscriptions
-- Problem: Users can have multiple 'all'-scope subscriptions (no constraint)
-- Solution:
--   1. Keep the oldest row for each user's 'all' scope, delete rest
--   2. Add partial unique index to prevent future duplicates

-- Step 1: Identify and keep oldest 'all'-scope subscription per user
WITH duplicates AS (
  SELECT id, user_id, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id, scope ORDER BY created_at ASC) as rn
  FROM public.calendar_subscriptions
  WHERE scope = 'all' AND department_id IS NULL
)
DELETE FROM public.calendar_subscriptions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Create partial unique index to enforce single 'all' scope per user
CREATE UNIQUE INDEX IF NOT EXISTS calendar_subscriptions_all_scope_unique
  ON public.calendar_subscriptions (user_id)
  WHERE scope = 'all' AND department_id IS NULL;
