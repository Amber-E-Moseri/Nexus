-- Space integrations (Google Drive, Zoom) per space

CREATE TABLE IF NOT EXISTS public.space_integrations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id     uuid        NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  integration_type  text        NOT NULL CHECK (integration_type IN ('google_drive', 'zoom')),
  display_name      text        NOT NULL DEFAULT '',
  config            jsonb       NOT NULL DEFAULT '{}',
  is_active         boolean     NOT NULL DEFAULT true,
  connected_by      uuid        REFERENCES public.users(id),
  last_synced_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, integration_type)
);

CREATE TABLE IF NOT EXISTS public.space_integration_secrets (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid  REFERENCES public.space_integrations(id) ON DELETE CASCADE,
  secret_key     text  NOT NULL,
  secret_value   text  NOT NULL,
  expires_at     timestamptz,
  UNIQUE (integration_id, secret_key)
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_space_integrations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_space_integrations_updated_at ON public.space_integrations;
CREATE TRIGGER trg_space_integrations_updated_at
  BEFORE UPDATE ON public.space_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_space_integrations_updated_at();

-- RLS
ALTER TABLE public.space_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_integration_secrets ENABLE ROW LEVEL SECURITY;

-- View integrations: space members + super_admin
CREATE POLICY "space_integrations_select" ON public.space_integrations
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    OR department_id IN (
      SELECT department_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Add/edit/disconnect: dept_lead + super_admin
CREATE POLICY "space_integrations_write" ON public.space_integrations
  FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('super_admin', 'dept_lead')
  ) WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('super_admin', 'dept_lead')
  );

-- Secrets: super_admin only
CREATE POLICY "space_integration_secrets_select" ON public.space_integration_secrets
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "space_integration_secrets_write" ON public.space_integration_secrets
  FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  ) WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );
