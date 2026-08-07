-- Nova R2: Expand nova_sessions.session_type CHECK to include meeting_extract.
-- The DO block finds and drops whatever constraint name was set at table creation,
-- then re-adds an expanded version — idempotent and name-agnostic.

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'nova_sessions'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%session_type%';

  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.nova_sessions DROP CONSTRAINT ' || quote_ident(v_conname);
  END IF;
END $$;

ALTER TABLE public.nova_sessions
  ADD CONSTRAINT nova_sessions_session_type_check
  CHECK (session_type IN (
    'chat', 'daily_brief', 'meeting_prep', 'meeting_extract',
    'project_analysis', 'report'
  ));
