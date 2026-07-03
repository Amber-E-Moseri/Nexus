CREATE TABLE IF NOT EXISTS public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  campus_name_alt TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  hub TEXT,
  group_name TEXT,
  spotify_playlist_id TEXT,
  status TEXT DEFAULT 'active',
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campuses_group_name ON public.campuses(group_name);
CREATE INDEX IF NOT EXISTS idx_campuses_status ON public.campuses(status);
CREATE INDEX IF NOT EXISTS idx_campuses_location ON public.campuses(latitude, longitude);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campuses_read_all"
  ON public.campuses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "campuses_edit_admin_ors"
  ON public.campuses FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'ors')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'ors')
  ));
