-- meeting_doc_connection
-- Singleton table for the org-level Google Drive OAuth connection used by
-- generate-meeting-doc. Mirrors ministry_calendar_connection in structure:
-- vault-backed tokens (access + refresh), singleton enforced by UNIQUE ((true)).
-- The GOOGLE_REFRESH_TOKEN static secret is no longer used by the edge function
-- once this table is populated via the in-app connect flow.

CREATE TABLE IF NOT EXISTS public.meeting_doc_connection (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_vault_id  uuid,
  refresh_token_vault_id uuid,
  token_expiry           timestamptz,
  connected_by           uuid,
  needs_reauth           boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Enforce singleton: only one row may exist.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_doc_connection_singleton
  ON public.meeting_doc_connection ((true));

ALTER TABLE public.meeting_doc_connection ENABLE ROW LEVEL SECURITY;

-- Super admins can read the row (e.g., future direct queries). All writes go
-- through the edge function (service role), which bypasses RLS.
CREATE POLICY "meeting_doc_connection_select_admins"
  ON public.meeting_doc_connection
  FOR SELECT
  USING (
    COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb)->>'user_role',
      (SELECT role FROM public.users WHERE id = auth.uid())
    ) = 'super_admin'
  );
