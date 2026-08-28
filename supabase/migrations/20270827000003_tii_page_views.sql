CREATE TABLE IF NOT EXISTS tii_page_views (
  view_date date PRIMARY KEY DEFAULT CURRENT_DATE,
  view_count integer NOT NULL DEFAULT 0
);

ALTER TABLE tii_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_tii_views" ON tii_page_views FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION increment_tii_page_view()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO tii_page_views (view_date, view_count)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (view_date) DO UPDATE SET view_count = tii_page_views.view_count + 1;
$$;
