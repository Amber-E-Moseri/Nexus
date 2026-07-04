-- Create sprint_access_requests table for users to request entry
CREATE TABLE public.sprint_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT now(),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES public.users(id),
  UNIQUE(sprint_id, user_id)
);

-- Enable RLS
ALTER TABLE public.sprint_access_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "sprint_requests_select_own" ON public.sprint_access_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Sprint managers can see all requests for their sprint
CREATE POLICY "sprint_requests_select_managers" ON public.sprint_access_requests
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sprint_members sm
    WHERE sm.sprint_id = sprint_access_requests.sprint_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('manager', 'lead')
  )
);

-- Users can insert their own requests
CREATE POLICY "sprint_requests_insert" ON public.sprint_access_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Sprint managers can update requests
CREATE POLICY "sprint_requests_update" ON public.sprint_access_requests
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sprint_members sm
    WHERE sm.sprint_id = sprint_access_requests.sprint_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('manager', 'lead')
  )
);

-- Create index for quick lookups
CREATE INDEX idx_sprint_access_requests_sprint_id
  ON public.sprint_access_requests(sprint_id);
CREATE INDEX idx_sprint_access_requests_user_id
  ON public.sprint_access_requests(user_id);
CREATE INDEX idx_sprint_access_requests_status
  ON public.sprint_access_requests(status);
