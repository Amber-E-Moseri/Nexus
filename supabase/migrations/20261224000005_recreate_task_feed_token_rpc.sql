-- Force PostgREST schema cache refresh by dropping and re-creating the RPC.
-- The NOTIFY pgrst signal (20261224000003) didn't reliably refresh the schema
-- after the function signature changed to accept NULL space_id (20261223000001).
-- Dropping + recreating forces PostgREST to re-introspect the function.

DROP FUNCTION IF EXISTS public.get_or_create_task_feed_token(uuid, uuid, text);

CREATE FUNCTION public.get_or_create_task_feed_token(
  p_user_id   uuid,
  p_space_id  uuid DEFAULT NULL,
  p_feed_type text DEFAULT NULL
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

COMMENT ON FUNCTION public.get_or_create_task_feed_token IS
  'Create or fetch a task-feed subscription token. Supports space-scoped (space_id NOT NULL) and global (space_id IS NULL) feeds.';

notify pgrst, 'reload schema';
