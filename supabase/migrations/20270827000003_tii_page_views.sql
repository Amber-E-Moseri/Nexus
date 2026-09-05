CREATE TABLE IF NOT EXISTS tii_page_views (
  view_date date PRIMARY KEY DEFAULT CURRENT_DATE,
  view_count integer NOT NULL DEFAULT 0
);
ALTER TABLE tii_page_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_can_read_tii_views" ON tii_page_views;
CREATE POLICY "anyone_can_read_tii_views" ON tii_page_views FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS tii_page_visitor_log (
  user_id uuid NOT NULL,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, view_date)
);
ALTER TABLE tii_page_visitor_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "editors_read_tii_visitor_log" ON tii_page_visitor_log;
CREATE POLICY "editors_read_tii_visitor_log" ON tii_page_visitor_log FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION increment_tii_page_view()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO tii_page_views (view_date, view_count)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (view_date) DO UPDATE SET view_count = tii_page_views.view_count + 1;

  INSERT INTO tii_page_visitor_log (user_id, view_date)
  SELECT auth.uid(), CURRENT_DATE
  WHERE auth.uid() IS NOT NULL
  ON CONFLICT (user_id, view_date) DO NOTHING;
$$;
