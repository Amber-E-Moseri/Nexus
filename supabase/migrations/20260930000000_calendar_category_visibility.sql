-- Calendar category visibility rules
-- Programs team configures which event categories/tags are visible to which roles.
-- Applied at iCal feed generation time. Default: all categories visible (fail open).

CREATE TABLE IF NOT EXISTS public.calendar_category_visibility (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL,
  category    text        NOT NULL, -- matches calendar_events.event_type
  role        text        NOT NULL, -- matches users.role (e.g. 'pastor', 'dept_lead')
  visible     boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, category, role)
);

CREATE INDEX IF NOT EXISTS calendar_category_visibility_org_role_idx
  ON public.calendar_category_visibility(org_id, role);

-- RLS: only super_admin can manage rules; anyone can read (needed by edge function via service key)
ALTER TABLE public.calendar_category_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visibility_super_admin_all"
  ON public.calendar_category_visibility
  USING (auth.jwt() ->> 'user_role' = 'super_admin')
  WITH CHECK (auth.jwt() ->> 'user_role' = 'super_admin');

-- Helper: get hidden categories for a given role in an org.
-- Returns categories with visible=false. If a category has no row, it defaults to visible.
CREATE OR REPLACE FUNCTION public.get_hidden_categories(p_org_id uuid, p_role text)
RETURNS TABLE(category text)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT category
  FROM public.calendar_category_visibility
  WHERE org_id = p_org_id
    AND role = p_role
    AND visible = false;
$$;

COMMENT ON TABLE public.calendar_category_visibility IS
  'Controls which event categories/tags are visible per role in iCal feeds. Missing rows default to visible.';
