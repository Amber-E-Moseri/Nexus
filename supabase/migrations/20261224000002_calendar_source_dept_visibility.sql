-- Per-source department visibility for Ministry Calendar.
-- Same semantic as calendar_category_dept_visibility:
--   No rows for a source  = org-wide (every dept sees it)
--   Has rows for a source = only listed depts see it

CREATE TABLE public.ministry_calendar_source_dept_visibility (
  source_id     uuid NOT NULL REFERENCES public.ministry_calendar_sources(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, department_id)
);

ALTER TABLE public.ministry_calendar_source_dept_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_source_visibility"
  ON public.ministry_calendar_source_dept_visibility
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manage_source_visibility"
  ON public.ministry_calendar_source_dept_visibility
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'user_role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'super_admin');
