-- Integration request workflow: allow anyone to request, require dept_lead/super_admin approval

CREATE TABLE IF NOT EXISTS public.integration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('google_drive', 'zoom', 'foundation_school', 'canva', 'custom')),
  display_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_integration_requests_department_id ON public.integration_requests(department_id);
CREATE INDEX idx_integration_requests_status ON public.integration_requests(status);
CREATE INDEX idx_integration_requests_requested_by ON public.integration_requests(requested_by);

-- RLS
ALTER TABLE public.integration_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "integration_requests_select_own" ON public.integration_requests
FOR SELECT USING (requested_by = auth.uid());

-- Dept leads and super admins can see all requests for their department
CREATE POLICY "integration_requests_select_leads" ON public.integration_requests
FOR SELECT USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  OR (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'dept_lead'
    AND department_id IN (SELECT department_id FROM public.users WHERE id = auth.uid())
  )
);

-- Anyone can create requests
CREATE POLICY "integration_requests_insert" ON public.integration_requests
FOR INSERT WITH CHECK (
  requested_by = auth.uid()
  AND department_id IN (SELECT department_id FROM public.users WHERE id = auth.uid())
);

-- Only dept_lead and super_admin can approve/reject
CREATE POLICY "integration_requests_update" ON public.integration_requests
FOR UPDATE USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  OR (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'dept_lead'
    AND department_id IN (SELECT department_id FROM public.users WHERE id = auth.uid())
  )
) WITH CHECK (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  OR (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'dept_lead'
    AND department_id IN (SELECT department_id FROM public.users WHERE id = auth.uid())
  )
);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.set_integration_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_integration_requests_updated_at ON public.integration_requests;
CREATE TRIGGER trg_integration_requests_updated_at
  BEFORE UPDATE ON public.integration_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_requests_updated_at();
