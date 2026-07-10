-- Space SOPs: links to documents, PDFs, or HTML pages pinned to each space
CREATE TABLE IF NOT EXISTS space_sops (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  url         text        NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2000),
  file_type   text        NOT NULL DEFAULT 'link'
                            CHECK (file_type IN ('pdf', 'doc', 'html', 'link')),
  sort_order  integer     NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE space_sops ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read SOPs
CREATE POLICY "space_sops_select"
  ON space_sops FOR SELECT
  USING (auth.role() = 'authenticated');

-- Space leads, dept_leads, and super_admins can manage SOPs
CREATE POLICY "space_sops_write"
  ON space_sops FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('super_admin', 'dept_lead', 'regional_secretary')
          OR u.department_id = space_sops.space_id
        )
    )
  );

CREATE INDEX space_sops_space_id_idx ON space_sops (space_id, sort_order);
