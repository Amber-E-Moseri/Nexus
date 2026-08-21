-- Regional Updates table
CREATE TABLE public.regional_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.regional_updates ENABLE ROW LEVEL SECURITY;

-- Everyone can read if not expired
CREATE POLICY "read_active_regional_updates"
  ON public.regional_updates FOR SELECT
  TO authenticated
  USING (expires_at > now());

-- Only Regional Secretary can create
CREATE POLICY "rs_can_create_regional_updates"
  ON public.regional_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'regional_secretary'
    )
  );

-- Only RS creator can update their own
CREATE POLICY "rs_can_update_own_regional_updates"
  ON public.regional_updates FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'regional_secretary'
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'regional_secretary'
    )
  );

-- Only RS creator can delete their own
CREATE POLICY "rs_can_delete_own_regional_updates"
  ON public.regional_updates FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'regional_secretary'
    )
  );

-- Indexes for efficient queries
CREATE INDEX regional_updates_expires_at_idx ON public.regional_updates(expires_at DESC);
CREATE INDEX regional_updates_created_by_idx ON public.regional_updates(created_by);
