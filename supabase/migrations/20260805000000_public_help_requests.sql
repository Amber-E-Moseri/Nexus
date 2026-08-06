-- Public help requests: unauthenticated users can submit help inquiries
CREATE TABLE IF NOT EXISTS public.public_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'support' CHECK (category IN ('support', 'bug', 'feature_request')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS public_help_requests_created_at_idx ON public.public_help_requests(created_at);
CREATE INDEX IF NOT EXISTS public_help_requests_status_idx ON public.public_help_requests(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_public_help_request()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.public_help_requests SET updated_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_help_requests_touch ON public.public_help_requests;
CREATE TRIGGER public_help_requests_touch
  BEFORE UPDATE ON public.public_help_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_public_help_request();

-- RLS: only super_admin can view
ALTER TABLE public.public_help_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_help_requests_select" ON public.public_help_requests FOR SELECT
  USING (public.current_user_role() = 'super_admin');

CREATE POLICY "public_help_requests_insert" ON public.public_help_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_help_requests_update" ON public.public_help_requests FOR UPDATE
  USING (public.current_user_role() = 'super_admin');
