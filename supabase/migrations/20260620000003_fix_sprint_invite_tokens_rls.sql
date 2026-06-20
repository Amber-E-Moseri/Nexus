-- Allow unauthenticated users to read sprint invite tokens
-- They need to see tokens from the URL to validate invitations

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprint_invite_tokens') THEN
    ALTER TABLE public.sprint_invite_tokens DISABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
