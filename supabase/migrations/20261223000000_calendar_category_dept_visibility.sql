-- Calendar category visibility by department/space.
-- Replaces the role-based visibility model with a department-based one.
-- Semantics: if a category has ANY rows here, only those departments see it.
--            If zero rows for a category, it is org-wide (everyone sees it).

CREATE TABLE IF NOT EXISTS public.calendar_category_dept_visibility (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL,
  category      text        NOT NULL,  -- matches calendar_events.event_type
  department_id uuid        NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_by    uuid        REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, category, department_id)
);

CREATE INDEX IF NOT EXISTS calendar_cat_dept_vis_org_cat_idx
  ON public.calendar_category_dept_visibility(org_id, category);

ALTER TABLE public.calendar_category_dept_visibility ENABLE ROW LEVEL SECURITY;

-- Only super_admin can manage rules.
CREATE POLICY "cat_dept_vis_super_admin"
  ON public.calendar_category_dept_visibility
  USING (auth.jwt() ->> 'user_role' = 'super_admin')
  WITH CHECK (auth.jwt() ->> 'user_role' = 'super_admin');

-- Authenticated users can read (needed to filter the live calendar view).
CREATE POLICY "cat_dept_vis_read_authenticated"
  ON public.calendar_category_dept_visibility
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RPC: returns category names that are restricted but NOT visible to this department.
-- If a category has rows but this dept is not among them → hidden.
-- If a category has zero rows → org-wide → visible (not returned here).
CREATE OR REPLACE FUNCTION public.get_hidden_categories_for_dept(p_org_id uuid, p_department_id uuid)
RETURNS TABLE(category text)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT r.category
  FROM public.calendar_category_dept_visibility r
  WHERE r.org_id = p_org_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.calendar_category_dept_visibility r2
      WHERE r2.org_id = p_org_id
        AND r2.category = r.category
        AND r2.department_id = p_department_id
    );
$$;

COMMENT ON TABLE public.calendar_category_dept_visibility IS
  'Controls which event categories are visible per department. No rows for a category = org-wide (visible to all).';
