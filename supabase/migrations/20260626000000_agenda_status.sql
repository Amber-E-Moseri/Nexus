-- Add status field to agendas table
-- GUARD: agendas table created later by 20260729000001.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'agendas' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT ''draft'' CHECK (status IN (''draft'', ''finalized'', ''archived''))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agendas_status ON public.agendas(status)';

    EXECUTE $pol$
      CREATE POLICY "finalized_agendas_read_only"
        ON public.agendas FOR UPDATE TO authenticated
        USING (status = 'draft' AND auth.uid() = created_by)
        WITH CHECK (status = 'draft' AND auth.uid() = created_by)
    $pol$;

    EXECUTE $pol2$
      CREATE POLICY "super_admin_override"
        ON public.agendas FOR UPDATE TO authenticated
        USING ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin')
        WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin')
    $pol2$;
  END IF;
END;
$guard$;
