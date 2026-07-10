-- Global task feed types: all_my_tasks, all_followed_tasks, planner
-- Also makes space_id nullable so cross-space feeds can exist without a space.

-- 1. Drop the old NOT NULL constraint on space_id
ALTER TABLE public.task_feed_subscriptions
  ALTER COLUMN space_id DROP NOT NULL;

-- 2. Expand the allowed feed_type values
ALTER TABLE public.task_feed_subscriptions
  DROP CONSTRAINT IF EXISTS task_feed_subscriptions_feed_type_check;

ALTER TABLE public.task_feed_subscriptions
  ADD CONSTRAINT task_feed_subscriptions_feed_type_check
  CHECK (feed_type IN ('my_tasks', 'followed_tasks', 'all_my_tasks', 'all_followed_tasks', 'planner'));

-- 3. The existing UNIQUE(user_id, space_id, feed_type) doesn't catch NULLs
--    in space_id. Add a partial unique index for global feeds (space_id IS NULL).
ALTER TABLE public.task_feed_subscriptions
  DROP CONSTRAINT IF EXISTS task_feed_subscriptions_user_id_space_id_feed_type_key;

-- For space-scoped feeds (space_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS task_feed_subscriptions_scoped_uniq
  ON public.task_feed_subscriptions (user_id, space_id, feed_type)
  WHERE space_id IS NOT NULL;

-- For global feeds (space_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS task_feed_subscriptions_global_uniq
  ON public.task_feed_subscriptions (user_id, feed_type)
  WHERE space_id IS NULL;

-- 4. Update the RPC to handle NULL space_id
CREATE OR REPLACE FUNCTION public.get_or_create_task_feed_token(
  p_user_id   uuid,
  p_space_id  uuid,     -- NULL for global feeds
  p_feed_type text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token text;
BEGIN
  IF p_space_id IS NOT NULL THEN
    INSERT INTO public.task_feed_subscriptions (user_id, space_id, feed_type)
    VALUES (p_user_id, p_space_id, p_feed_type)
    ON CONFLICT DO NOTHING;

    SELECT token INTO v_token
    FROM public.task_feed_subscriptions
    WHERE user_id = p_user_id
      AND space_id = p_space_id
      AND feed_type = p_feed_type;
  ELSE
    INSERT INTO public.task_feed_subscriptions (user_id, space_id, feed_type)
    VALUES (p_user_id, NULL, p_feed_type)
    ON CONFLICT DO NOTHING;

    SELECT token INTO v_token
    FROM public.task_feed_subscriptions
    WHERE user_id = p_user_id
      AND space_id IS NULL
      AND feed_type = p_feed_type;
  END IF;

  RETURN v_token;
END;
$$;

COMMENT ON TABLE public.task_feed_subscriptions IS
  'Token-based iCal subscriptions for task feeds. space_id may be NULL for global (cross-space) feeds.';
