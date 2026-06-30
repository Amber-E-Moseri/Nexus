-- Task iCal feed subscriptions
-- Separate from Ministry Calendar subscriptions — scoped to a space and a user.
-- Two feed types: my_tasks (assignee_id = user) and followed_tasks (tasks user follows).

CREATE TABLE IF NOT EXISTS public.task_feed_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  space_id    uuid        NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  feed_type   text        NOT NULL CHECK (feed_type IN ('my_tasks', 'followed_tasks')),
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, space_id, feed_type)
);

CREATE INDEX IF NOT EXISTS task_feed_subscriptions_token_idx ON public.task_feed_subscriptions(token);
CREATE INDEX IF NOT EXISTS task_feed_subscriptions_user_idx  ON public.task_feed_subscriptions(user_id);

ALTER TABLE public.task_feed_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own subscriptions
CREATE POLICY "task_feed_own_rows"
  ON public.task_feed_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Helper: upsert a task feed subscription and return the token
CREATE OR REPLACE FUNCTION public.get_or_create_task_feed_token(
  p_user_id  uuid,
  p_space_id uuid,
  p_feed_type text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token text;
BEGIN
  INSERT INTO public.task_feed_subscriptions (user_id, space_id, feed_type)
  VALUES (p_user_id, p_space_id, p_feed_type)
  ON CONFLICT (user_id, space_id, feed_type) DO NOTHING;

  SELECT token INTO v_token
  FROM public.task_feed_subscriptions
  WHERE user_id = p_user_id AND space_id = p_space_id AND feed_type = p_feed_type;

  RETURN v_token;
END;
$$;

COMMENT ON TABLE public.task_feed_subscriptions IS
  'Token-based iCal subscriptions for per-space task feeds (my_tasks / followed_tasks).';
