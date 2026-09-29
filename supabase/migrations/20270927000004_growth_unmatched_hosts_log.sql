-- Log unmatched host units during sync for debugging
-- Tracks fellowships that report data but aren't in our schedule

CREATE TABLE IF NOT EXISTS public.growth_sync_unmatched_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_date timestamp with time zone NOT NULL DEFAULT now(),
  host_name text NOT NULL,
  service_kind text NOT NULL,
  report_count integer NOT NULL DEFAULT 1,
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_growth_unmatched_hosts_sync_date ON public.growth_sync_unmatched_hosts(sync_date DESC);
CREATE INDEX IF NOT EXISTS idx_growth_unmatched_hosts_name ON public.growth_sync_unmatched_hosts(host_name);

ALTER TABLE public.growth_sync_unmatched_hosts ENABLE ROW LEVEL SECURITY;

-- Admin only access
DROP POLICY IF EXISTS "growth_sync_unmatched_hosts_admin" ON public.growth_sync_unmatched_hosts;
CREATE POLICY "growth_sync_unmatched_hosts_admin" ON public.growth_sync_unmatched_hosts
  FOR ALL USING (auth.jwt() ->> 'user_role' = 'super_admin');

COMMENT ON TABLE public.growth_sync_unmatched_hosts IS
  'Tracks host units that submit data but are not in service_center_schedule or host_name_history. Helps identify missing mappings or new fellowships.';
