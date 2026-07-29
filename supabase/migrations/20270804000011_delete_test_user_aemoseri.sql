-- Delete test user aemoseri@my.yorku.ca
-- Nullify FK references before deleting so constraint checks pass
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.users WHERE email = 'aemoseri@my.yorku.ca';
  IF v_id IS NULL THEN RETURN; END IF;

  UPDATE public.tasks SET assignee_id  = NULL WHERE assignee_id  = v_id;
  UPDATE public.tasks SET created_by   = NULL WHERE created_by   = v_id;
  UPDATE public.task_comments SET author_id = NULL WHERE author_id = v_id;

  DELETE FROM public.sprint_members      WHERE user_id = v_id;
  DELETE FROM public.sprint_team_members WHERE user_id = v_id;
  DELETE FROM public.activity_log        WHERE user_id = v_id;

  DELETE FROM public.users WHERE id = v_id;
END $$;
