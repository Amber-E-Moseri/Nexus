-- Allows a space to opt out of specific org-wide statuses.
-- A row here means the org status is hidden for that department's task picker.
CREATE TABLE IF NOT EXISTS public.space_disabled_org_statuses (
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  org_status_id uuid NOT NULL REFERENCES public.task_status_definitions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, org_status_id)
);

ALTER TABLE public.space_disabled_org_statuses ENABLE ROW LEVEL SECURITY;

-- Anyone can read (status visibility is not sensitive)
CREATE POLICY "space_disabled_org_statuses_select"
  ON public.space_disabled_org_statuses
  FOR SELECT TO authenticated
  USING (true);

-- Only super_admin and dept_lead of the owning dept can write
CREATE POLICY "space_disabled_org_statuses_write"
  ON public.space_disabled_org_statuses
  FOR ALL TO authenticated
  USING (
    current_user_role() IN ('super_admin', 'regional_secretary')
    OR (
      current_user_role() = 'dept_lead'
      AND department_id = current_user_department()
    )
  )
  WITH CHECK (
    current_user_role() IN ('super_admin', 'regional_secretary')
    OR (
      current_user_role() = 'dept_lead'
      AND department_id = current_user_department()
    )
  );
