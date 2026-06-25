-- Add status field to agendas table
ALTER TABLE public.agendas
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
CHECK (status IN ('draft', 'finalized', 'archived'));

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_agendas_status ON public.agendas(status);

-- Add RLS policy: prevent editing finalized agendas
CREATE POLICY IF NOT EXISTS "finalized_agendas_read_only"
  ON public.agendas FOR UPDATE
  TO authenticated
  USING (status = 'draft' AND auth.uid() = created_by)
  WITH CHECK (status = 'draft' AND auth.uid() = created_by);

-- Ensure super_admin can always update
CREATE POLICY IF NOT EXISTS "super_admin_override"
  ON public.agendas FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin');
