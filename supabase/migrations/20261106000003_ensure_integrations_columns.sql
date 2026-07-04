-- Idempotently ensure all scoping columns exist on external_integrations.
-- These were added in 20260624-20260625 migrations but may not have applied to remote.

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS show_in_sidebar BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS department_ids UUID[] DEFAULT ARRAY[]::UUID[];

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global'
    CHECK (scope IN ('global', 'departments', 'users'));

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.external_integrations
  ADD COLUMN IF NOT EXISTS user_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Indexes (all conditional)
CREATE INDEX IF NOT EXISTS external_integrations_department_ids_idx
  ON public.external_integrations USING GIN (department_ids);

CREATE INDEX IF NOT EXISTS external_integrations_user_ids_idx
  ON public.external_integrations USING GIN (user_ids);

CREATE INDEX IF NOT EXISTS external_integrations_scope_idx
  ON public.external_integrations (scope);

-- Replace select policy to handle all scoping variants
DROP POLICY IF EXISTS "external_integrations_select" ON public.external_integrations;

CREATE POLICY "external_integrations_select" ON public.external_integrations
  FOR SELECT TO authenticated
  USING (
    enabled = true AND (
      public.current_user_role() = 'super_admin'
      OR (
        -- Global: no department or user restrictions
        (department_id IS NULL)
        AND (department_ids IS NULL OR array_length(department_ids, 1) IS NULL)
        AND (user_id IS NULL)
        AND (user_ids IS NULL OR array_length(user_ids, 1) IS NULL)
        AND (visible_to = 'all' OR visible_to = public.current_user_role())
      )
      OR (department_id IS NOT NULL AND department_id = public.current_user_department())
      OR (department_ids IS NOT NULL AND array_length(department_ids, 1) > 0
          AND public.current_user_department() = ANY(department_ids))
      OR (user_id IS NOT NULL AND user_id = auth.uid())
      OR (user_ids IS NOT NULL AND array_length(user_ids, 1) > 0
          AND auth.uid() = ANY(user_ids))
    )
  );
