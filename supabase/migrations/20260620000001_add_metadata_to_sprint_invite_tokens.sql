DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprint_invite_tokens') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sprint_invite_tokens' AND column_name = 'metadata') THEN
      ALTER TABLE public.sprint_invite_tokens ADD COLUMN metadata JSONB DEFAULT NULL;
    END IF;
  END IF;
END
$$;
